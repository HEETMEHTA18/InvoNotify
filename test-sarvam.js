const https = require('https');
const fs = require('fs');
const path = require('path');

const apiKey = process.env.SARVAM_API_KEY || "sk_vgj1flo2_hls84rTTWJTSPKPMLJpeuFjT";
const endpoints = [
    '/document-intelligence',
    '/v1/document-intelligence',
    '/api/document-intelligence',
    '/ocr',
    '/v1/ocr',
    '/read',
    '/v1/read',
    '/vision',
    '/v1/vision',
    '/extract',
    '/v1/extract'
];

const host = 'api.sarvam.ai';

const fileContent = fs.readFileSync(path.join(__dirname, 'public/window.svg'));
// We will send a basic request. Even if body is wrong, we look for != 404.

function checkEndpoint(endpoint) {
    return new Promise((resolve) => {
        const options = {
            hostname: host,
            path: endpoint,
            method: 'POST',
            headers: {
                'api-subscription-key': apiKey,
                'Content-Type': 'multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW'
            }
        };

        const req = https.request(options, (res) => {
            console.log(`${endpoint}: ${res.statusCode}`);
            resolve();
        });

        req.on('error', (e) => {
            console.error(`${endpoint}: Error ${e.message}`);
            resolve();
        });

        // Write incomplete body just to trigger status
        req.write('----WebKitFormBoundary7MA4YWxkTrZu0gW\r\n');
        req.write('Content-Disposition: form-data; name="file"; filename="window.svg"\r\n');
        req.write('Content-Type: image/svg+xml\r\n\r\n');
        req.write(fileContent);
        req.write('\r\n----WebKitFormBoundary7MA4YWxkTrZu0gW--');
        req.end();
    });
}

(async () => {
    console.log("Checking Sarvam Endpoints...");
    for (const ep of endpoints) {
        await checkEndpoint(ep);
    }
})();
