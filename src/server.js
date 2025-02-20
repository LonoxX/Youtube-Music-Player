const express = require('express');
const path = require('path');
const routes = require('./api/routes');
const config = require('../config.json');

const app = express();
const port = config.AppPort || 3000;

app.use(express.json());
app.use('/', routes);
app.use(express.static(path.join(__dirname, 'ui')));

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
