const auth = require("../firebaseAdmin");

// 🛠️ MOCK TEST INTERCEPTOR (Bypasses Firebase for local terminal testing)
function verifyFirebase(req, res, next) {
    const mockUid = req.headers['x-mock-uid'];
    if (mockUid) {
        req.uid = mockUid; // Inject the test UID directly
        return next();
    }

    // Normal Production Firebase Validation
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "No token or invalid format" });
    }
    const token = header.split(" ")[1];
    
    auth.verifyIdToken(token)
        .then((decoded) => {
            req.uid = decoded.uid;
            next();
        })
        .catch((error) => {
            return res.status(401).json({ message: "Invalid token" });
        });
}

module.exports = verifyFirebase;
