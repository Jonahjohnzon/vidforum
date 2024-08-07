const express = require('express');
const app = express();
const cors = require('cors');
const mongoose = require('./mongo.js');
const router = require('./Routes/routes.js');
require('dotenv').config();

app.use(cors());
mongoose();

app.use(require('express').json());
app.use('/', router);

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log('Connected to port ' + port);
});
