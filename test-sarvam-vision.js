const https = require('https');
const fs = require('fs');
const path = require('path');

const apiKey = "sk_vgj1flo2_hls84rTTWJTSPKPMLJpeuFjT";
const host = 'api.sarvam.ai';
const endpoint = '/vision'; // Found!

// Use a proper image file if possible, or dummy content
const fileContent = Buffer.from("dummy image content");

const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

const data = `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="image"; filename="test.txt"\r\n` +
    `Content-Type: text/plain\r\n\r\n` +
    `dummy text content\r\n` +
    `--${boundary}--\r\n`;

const options = {
    hostname: host,
    path: endpoint,
    method: 'POST',
    headers: {
        'api-subscription-key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': Buffer.byteLength(data)
    }
};

const req = https.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log("Body:", body);
    });
});

req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
});

req.write(data);
req.end();
