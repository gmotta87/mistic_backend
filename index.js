console.log("Starting server...");
require('dotenv').config();
const express = require('express');
const { auth } = require('google-auth-library');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { google } = require('googleapis');


const app = express();
app.use(require('cors')());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
const client = new MongoClient(mongoUri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function connectDB() {
  try {
    await client.connect();
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Could not connect to MongoDB", error);
    process.exit(1);
  }
}

connectDB();

const playAuth = new google.auth.GoogleAuth({
  keyFile: './service-account.json', // Path to your service account key file
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const androidpublisher = google.androidpublisher({
  version: 'v3',
  auth: playAuth,
});


async function listProducts(packageName) {
  try {
    console.log("--- INSIDE listProducts ---");
    console.log("Package Name:", packageName);
    const res = await androidpublisher.inappproducts.list({
      packageName: packageName,
    });
    console.log("Products:", res.data.inappproduct);
    return res.data.inappproduct;
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
}

async function listSubscriptionPlans(packageName) {
  try {
    console.log("--- INSIDE listSubscriptionPlans ---");
    console.log("Package Name:", packageName);

    // Fetching subscription products with full details
    console.log("Fetching subscription products with details...");
    const subsRes = await androidpublisher.monetization.subscriptions.list({
      packageName: packageName,
    });
    
    // Fetch details for each subscription to get localized data
    const subscriptionsWithDetails = await Promise.all(
      (subsRes.data.subscriptions || []).map(async (sub) => {
        try {
          const detailRes = await androidpublisher.monetization.subscriptions.get({
            packageName: packageName,
            productId: sub.productId,
          });
          return detailRes.data;
        } catch (err) {
          console.error(`Error fetching details for ${sub.productId}:`, err.message);
          return sub; // Return basic info if detail fetch fails
        }
      })
    );
    
    console.log(`Found ${subscriptionsWithDetails.length} subscriptions with details.`);

    // Fetching in-app products with details
    console.log("Fetching in-app products with details...");
    // const inappRes = await androidpublisher.inappproducts.list({
    //   packageName: packageName,
    // });
    
    // Process in-app products to get full details
    // const inappProducts = (inappRes.data.inappproduct || []).map(prod => {
    //   // Extract localized listings
    //   const listings = prod.listings || {};
    //   const defaultLanguage = prod.defaultLanguage || 'pt-BR';
      
    //   return {
    //     ...prod,
    //     localizedListings: Object.entries(listings).reduce((acc, [lang, listing]) => {
    //       acc[lang] = {
    //         title: listing.title,
    //         description: listing.description,
    //       };
    //       return acc;
    //     }, {})
    //   };
    // });
    
    // console.log(`Found ${inappProducts.length} in-app products with details.`);

    // Helper function to format price
    const formatPrice = (price) => {
      if (!price) return 'N/A';
      if (price.units !== undefined && price.nanos !== undefined) {
        return `${price.units}.${price.nanos.toString().padStart(9, '0')}`.replace(/\.?0+$/, '');
      }
      if (price.priceMicros) {
        return (price.priceMicros / 1000000).toString();
      }
      return 'N/A';
    };

    // Process subscription details
    const unifiedSubscriptions = subscriptionsWithDetails.flatMap(sub => {
      return sub.basePlans?.map(basePlan => {
        const price = basePlan.regionalPriceOffers?.[0]?.price || basePlan.otherRegionsConfig?.usdPrice;
        const formattedPrice = formatPrice(price);
        
        // Extract localized titles and descriptions from listings
        const localizedListings = sub.listings || {};
        const names = {};
        const descriptions = {};
        
        Object.entries(localizedListings).forEach(([lang, listing]) => {
          // Convert to simple language code (e.g., 'pt-BR' -> 'pt')
          const simpleLang = lang.split('-')[0];
          names[simpleLang] = listing.title;
          descriptions[simpleLang] = listing.description;
        });
        
        return {
          id: sub.productId,
          type: 'subscription',
          price: formattedPrice,
          currencyCode: price?.currencyCode || 'USD',
          billingPeriod: basePlan.autoRenewingBasePlanType?.billingPeriodDuration || 'N/A',
          names,
          descriptions,
          metadata: {
            basePlanId: basePlan.basePlanId,
            status: sub.status,
            taxAndComplianceSettings: sub.taxAndComplianceSettings
          }
        };
      }) || [];
    });

    // Process in-app product details
    // const unifiedInAppProducts = inappProducts.map(prod => {
    //   const price = prod.defaultPrice || {};
    //   const formattedPrice = formatPrice(price);
      
      // Extract localized titles and descriptions
      const names = {};
      const descriptions = {};
      
      // Object.entries(prod.localizedListings || {}).forEach(([lang, listing]) => {
      //   // Convert to simple language code (e.g., 'pt-BR' -> 'pt')
      //   const simpleLang = lang.split('-')[0];
      //   names[simpleLang] = listing.title;
      //   descriptions[simpleLang] = listing.description;
      // });
      
      // return {
      //   id: prod.sku,
      //   type: 'inapp',
      //   price: formattedPrice,
      //   currencyCode: price.currency || 'USD',
      //   billingPeriod: 'one_time',
      //   names,
      //   descriptions,
      //   metadata: {
      //     status: prod.status,
      //     purchaseType: prod.purchaseType,
      //     defaultLanguage: prod.defaultLanguage
      //   }
      // };
    // });
    
    const allProducts = [...unifiedSubscriptions];

    console.log("Final unified products:", JSON.stringify(allProducts, null, 2));
    return allProducts;

  } catch (err) {
    console.error('--- ERROR in listSubscriptionPlans ---');
    console.error('Error message:', err.message);
    if (err.response) {
      console.error('Error response data:', JSON.stringify(err.response.data, null, 2));
    }
    
    // Return a structured error to the client
    return {
      error: true,
      message: err.message,
      details: err.response?.data?.error || 'No additional details',
      timestamp: new Date().toISOString()
    };
  }
}


/**
 * @swagger
 * /verify-purchase:
 *   post:
 *     summary: Verify a purchase
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               packageName:
 *                 type: string
 *               productId:
 *                 type: string
 *               token:
 *                 type: string
 *               profileId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Purchase verified successfully
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Internal server error
 */
app.post('/verify-purchase', async (req, res) => {
  const { packageName, productId, token, profileId } = req.body;

  if (!packageName || !productId || !token || !profileId) {
    return res.status(400).json({ error: 'Missing required fields: packageName, productId, token, profileId' });
  }

  try {
    const authClient = auth.fromJSON({
        type: process.env.GOOGLE_SERVICE_ACCOUNT_TYPE,
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: process.env.GOOGLE_AUTH_URI,
        token_uri: process.env.GOOGLE_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
    });

    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${token}`;

    const apiResponse = await authClient.request({ url });

    if (apiResponse.status === 200) {
      console.log('Purchase verified successfully:', apiResponse.data);
      await grantPremiumAccess(profileId, apiResponse.data);
      res.status(200).json({
        message: 'Purchase verified successfully',
        purchaseInfo: apiResponse.data,
      });
    } else {
      res.status(apiResponse.status).json({
        error: 'Failed to verify purchase',
        details: apiResponse.data,
      });
    }
  } catch (error) {
    console.error('Error verifying purchase:', error.response ? error.response.data : error.message);
    res.status(500).json({
      error: 'An internal error occurred during purchase verification.',
      details: error.response ? error.response.data.error : 'No additional details',
    });
  }
});

async function grantPremiumAccess(profileId, purchaseInfo) {
    try {
        const database = client.db("mistic");
        const users = database.collection("users");

        const result = await users.updateOne(
            { id: profileId },
            { $set: { isPremium: true, purchaseInfo: purchaseInfo } }
        );

        if (result.matchedCount === 0) {
            // If no user is found, create a new one
            await users.insertOne({
                id: profileId,
                isPremium: true,
                purchaseInfo: purchaseInfo,
                createdAt: new Date(),
            });
            console.log(`New user created with premium access for profileId: ${profileId}`);
        } else {
            console.log(`Granted premium access for profileId: ${profileId}`);
        }
    } catch (error) {
        console.error("Error granting premium access:", error);
    }
}


/**
 * @swagger
 * /products:
 *   get:
 *     summary: Get product IDs
 *     responses:
 *       200:
 *         description: List of product IDs
 *       500:
 *         description: Internal server error
 */
app.get('/products', async (req, res) => {
  console.log('--- INSIDE /products endpoint ---');
  try {
    const plans = await listProducts('com.mistic.numerology');
    console.log('--- plans:', plans);
    res.json({ plans });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch product IDs' });
  }
});


/**
 * @swagger
 * /api/plans:
 *   get:
 *     summary: Get subscription plans
 *     responses:
 *       200:
 *         description: List of subscription plans
 *       500:
 *         description: Internal server error
 */
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await listSubscriptionPlans('com.mistic.numerology');
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});


/**
 * @swagger
 * /debug/google-play:
 *   get:
 *     summary: Debug Google Play Console API connection
 *     responses:
 *       200:
 *         description: Debug information
 *       500:
 *         description: Internal server error
 */
app.get('/debug/google-play', async (req, res) => {
  try {
    console.log('--- DEBUG: Testing Google Play Console API connection ---');
    
    // Test authentication
    const authClient = await playAuth.getClient();
    console.log('Authentication successful');
    
    // Test basic API access
    const packageName = 'com.mistic.numerology';
    console.log('Testing with package:', packageName);
    
    // Test app details
    try {
      const appDetails = await androidpublisher.applications.get({
        packageName: packageName,
      });
      console.log('App details:', JSON.stringify(appDetails.data, null, 2));
    } catch (appError) {
      console.log('Could not fetch app details:', appError.message);
    }
    
    // Test service account permissions
    const debugInfo = {
      timestamp: new Date().toISOString(),
      serviceAccount: {
        client_email: 'mistic@mistic-474013.iam.gserviceaccount.com',
        project_id: 'mistic-474013'
      },
      packageName: packageName,
      authTest: 'SUCCESS',
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
      apiVersion: 'v3'
    };
    
    res.json(debugInfo);
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
  }
});

require('./swagger')(app);

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});