import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export default cloudinary;

/**
 * Upload a base64 data URL to Cloudinary.
 * Returns the secure URL of the uploaded image.
 */
export async function uploadToCloudinary(
    base64DataUrl: string,
    folder: string = "invoice-settings"
): Promise<string> {
    const result = await cloudinary.uploader.upload(base64DataUrl, {
        folder,
        resource_type: "image",
        transformation: [
            { quality: "auto", fetch_format: "auto" },
        ],
    });
    return result.secure_url;
}

/**
 * Delete an image from Cloudinary by its URL.
 * Extracts the public_id from the URL for deletion.
 */
export async function deleteFromCloudinary(imageUrl: string): Promise<void> {
    try {
        // Extract public_id from Cloudinary URL
        // URL format: https://res.cloudinary.com/{cloud}/image/upload/v{version}/{folder}/{filename}.{ext}
        const urlParts = imageUrl.split("/upload/");
        if (urlParts.length < 2) return;

        // Remove version prefix (v1234567890/) and file extension
        const pathAfterUpload = urlParts[1];
        const publicId = pathAfterUpload
            .replace(/^v\d+\//, "") // remove version
            .replace(/\.[^/.]+$/, ""); // remove extension

        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        console.error("Failed to delete from Cloudinary:", error);
        // Don't throw — deletion failure shouldn't break the flow
    }
}
