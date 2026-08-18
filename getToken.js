const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = {
  "type": "service_account",
  "project_id": "venueflow-41bfb",
  "private_key_id": "9cbf7d8148837128b56e089e4d86b38289127c20",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCpADt5po6FWrub\nUBX4FVDpNQnPIETbXee5Q6KXfVw62tCMPCSiYUqc0/ztiPlTSJc8IgVNcIKdbFlB\nGn55mT/rvHtdoZQvgPnH57JoKkLoRXu8OJHSHsBgRp2p1pAMBBWzUe25CfiQDj5+\nsg0bywpA1ADVLZnZxtNTOUcf0/vl2t8nhjZVhJ3D7IkpYK0J5KVaO9kQW8qI/uRv\nyyl9VeOmMgwC+RCjd/AcQ0VidkWIe9xgPzJZwSWWKN1VBr+SNPG58gWn5HCk8bn3\ntBpeQ7XALmRJTlEWrvOMuuxE6GOD325j8UiX1GyvnEv38obgH8G8wQioEplQGkM/\nAALJdQX9AgMBAAECggEASq9BmVcTsLcSJWbU7pds9EJuHUyjYVY0a1kKZ2wM8C12\n8CI8Bk58jKXaJpbbqARyYS6frUNFVZBmOTEeJ1qkNudKlWwscnnK6J7p5sKWYtMi\nBWHyfyr71RAf6MhbTBQaCu7v4VAYuoCw+Yhx5pBp7ZBC9fJ7BRSqmyK63cPuk/rX\nv1PsZHYwJ72xAurTeEF5nLTktWOI7dVgj0GNzEb6wWTb77tTuuex+mK+yHTwWwFX\nbIwD3g++33ZfmuvxNLWv/8eoZQzcUtVDN4p7wCgXcJ07iCzIhJMY27HbCNLu97er\nsOkY1stdJshckg9eQygWt7Hc1ecU6Ul0U1Jl2o5m+QKBgQDQ/x7YARdWvJe4DQgb\n48hSoUqgTWUDJfah3KM/OLxBg36SR2YDNlsyxCYxtWGpMbYHbomV1C5uwoKBS+wl\nZnn9xxZOakvEar7pg3yIX//m3DtlV4/WFO7YBvspuW0P0/dYGSwvSKW32dRUIpor\n6OU5c/43zVS4d2tgEhB5selBzwKBgQDPAmFuV8xdII9FvzxQRwl6rIKK9p4wnSfr\IdY21ZdKaY8rjctGOYOntIePkqvpk3udRq0s2Ndr7j6mIbdWVVHLwLm8ibDGHHMT\GB2W4mxCgCGhSisXDydsutAos7NDVDQS5Id0615nLEALin7foxOfmpbBuVANo9tn\npm64g7eqcwKBgCLPm6+W3vBPkWXSpdsfYaqBuxBgU8bmd+IWAgrxxEmVQWvUAKXg\nU+hsy3/UGmQ4J32tZ7VRFjrUozAuGTNRklg25PxCsEQTE6GJiSCd/N3TKQGESCz8\nZ5wL7aHRhNzyDWzbJITrsM6itb8d1Fgj/qpHK7zXspjXK0dhOuVKQPP5AoGBAIGD\nwMeToOXnGByQIEEtoK2ivu4IjEJoIPCItAiMq+I/lvat+S8PjuJfHa1jG7HAt0dY\nT8LOTEFXxtSUJaubJ9jt1Ic0MmhQpmKc5O5g7VDR77iEud7seUMawl+kxpRqW0Yy\nutkY5XBxjARseyKaWg2yX34G3iIakYwQ4hcJOeEnAoGBAJBC2YrIZwp1aoT2qNqz\n8TZDbaNky93pcU1TfCB2WS6F3TWramIK/NBs96fcXLkqt7vGDNn7WWG9Huo9AvzJ\nB/1Dto69qDKdYkdO7oIvBSww9rZvMeH4uTORp5OtU+KSewrW2EuQ81aO8IYj7pZc\nLhD9yT1lgFlGoQZ2Oj3EnglK\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@://gserviceaccount.com"
};

initializeApp({
  credential: cert(serviceAccount)
});

async function getValidToken() {
  try {
    const auth = getAuth();
    const esdrasUid = "HC1gB96RppUzsMIzpSYpA2IhiQS2";
    
    // Create an un-hashed custom token explicitly containing Esdras's user credentials profile details
    const customToken = await auth.createCustomToken(esdrasUid, {
      email: "esdras@nomail.com",
      role: "user"
    });

    console.log("\n🔥 COPIED LOCAL SECURITY SIGNATURE FOR POSTMAN BELOW 🔥\n");
    console.log(customToken);
    console.log("\n=======================================================\n");
    process.exit(0);
  } catch (error) {
    console.error("Local signature generation failure:", error.message);
    process.exit(1);
  }
}

getValidToken();
