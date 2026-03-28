const functions = require('@google-cloud/functions-framework');

functions.http('cloudsnipDemo', (req, res) => {
  const start = Date.now();
  while (Date.now() - start < 100) {}
  res.send('OK');
});
