require("dotenv").config();
const { SarvamAIClient } = require("sarvamai");

const client = new SarvamAIClient({
    apiSubscriptionKey: process.env.SARVAM_API_KEY
});

async function main() {
    // Create a document intelligence job
    const job = await client.documentIntelligence.createJob({
        language: "en-IN",
        outputFormat: "html"
    });
    console.log(`Job created: ${job.jobId}`);

    // Upload document
    await job.uploadFile("document.pdf");
    console.log("File uploaded");

    // Start processing
    await job.start();
    console.log("Job started");

    // Wait for completion
    const status = await job.waitUntilComplete();
    console.log(`Job completed with state: ${status.job_state}`);

    // Get processing metrics
    const metrics = job.getPageMetrics();
    console.log("Page metrics:", metrics);

    // Download output (ZIP file containing the processed document)
    await job.downloadOutput("./output.zip");
    console.log("Output saved to ./output.zip");
}

main();