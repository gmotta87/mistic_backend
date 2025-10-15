const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: './mistic-service.json', // Path to your service account key file
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const androidpublisher = google.androidpublisher({
  version: 'v3',
  auth: auth,
});

async function listSubscriptionPlans(packageName) {
  try {
    console.log("--- INSIDE listSubscriptionPlans ---");
    const res = await androidpublisher.inappproducts.list({
      packageName: packageName,
    });
    console.log("--- AFTER aodpublisher.inappproducts.list ---");
    console.log(res);
    return res.data;
  } catch (err) {
    console.error('--- ERROR in listSubscriptionPlans ---');
    console.error(err);
    throw err;
  }
}

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

module.exports = {
  listProducts,
  listSubscriptionPlans,
  androidpublisher,
};