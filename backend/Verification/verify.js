const jwt = require('jsonwebtoken');

const verifyJwt = (req, res, next) => {
    const token = req.headers["auth-token"];

    if (!token) {
        return res.json({ message: 'Please Logins', auth: false, login:true });
    } else {
        try {
            const verifyWithJWTS = jwt.verify(token, process.env.JWTS);
            req.user = verifyWithJWTS;
            return next();
        } catch (errJWTS) {
            try {
                const verifyWithJWTT = jwt.verify(token, process.env.JWTT);
                req.user = verifyWithJWTT;
                return next();
            } catch (errJWTT) {
                return res.json({ message: 'Please Login', auth: false , login:true });
            }
        }
    }
};

module.exports = verifyJwt;
