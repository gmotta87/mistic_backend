console.log("Starting server...");
require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { google } = require('googleapis');


const app = express();
app.use(require('cors')());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// MongoDB connection
const mongoUri = 'mongodb+srv://gmotta:bR6XKVGLy0HDnh8h@cluster0.ba350.mongodb.net';
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

const { listProducts, listSubscriptionPlans, androidpublisher } = require('./google-play-api');




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
    const apiResponse = await androidpublisher.purchases.products.get({
      packageName,
      productId,
      token,
    });

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
    const authClient = await androidpublisher.auth.getClient();
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



// Start the server only if this file is run directly



if (require.main === module) {



  app.listen(PORT, () => {



    console.log(`Server is running on port ${PORT}`);



  });



}



module.exports = app;
