"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
    Upload,
    Trash2,
    Save,
    Loader2,
    CheckCircle2,
    ImageIcon,
    PenTool,
    Building2,
    AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsPage() {
    const [logo, setLogo] = useState<string | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState("");

    const logoInputRef = useRef<HTMLInputElement>(null);
    const signatureInputRef = useRef<HTMLInputElement>(null);

    // Signature drawing
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [showDrawPad, setShowDrawPad] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    async function fetchSettings() {
        try {
            const res = await fetch("/api/settings");
            if (res.ok) {
                const data = await res.json();
                setLogo(data.logo || null);
                setSignature(data.signature || null);
            }
        } catch {
            // Settings not found
        } finally {
            setLoading(false);
        }
    }

    async function uploadToCloudinary(base64: string): Promise<string | null> {
        try {
            setUploading(true);
            setError("");
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: base64 }),
            });
            if (!res.ok) {
                const err = await res.json();
                setError(err.error || "Failed to upload image");
                return null;
            }
            const data = await res.json();
            return data.url;
        } catch {
            setError("Failed to upload image");
            return null;
        } finally {
            setUploading(false);
        }
    }

    function handleFileUpload(
        e: React.ChangeEvent<HTMLInputElement>,
        setter: (val: string | null) => void
    ) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 2 * 1024 * 1024) {
            setError("File size must be less than 2MB");
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const base64 = reader.result as string;
            const url = await uploadToCloudinary(base64);
            if (url) {
                setter(url);
                setSuccess(false);
            }
        };
        reader.readAsDataURL(file);
    }

    // Canvas drawing functions
    function initCanvas() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = canvas.offsetWidth * 2;
        canvas.height = canvas.offsetHeight * 2;
        ctx.scale(2, 2);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1a1a2e";
        ctx.lineWidth = 2.5;
    }

    function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        setIsDrawing(true);
        const rect = canvas.getBoundingClientRect();
        let x: number, y: number;

        if ("touches" in e) {
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const rect = canvas.getBoundingClientRect();
        let x: number, y: number;

        if ("touches" in e) {
            e.preventDefault();
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else {
            x = e.clientX - rect.left;
            y = e.clientY - rect.top;
        }

        ctx.lineTo(x, y);
        ctx.stroke();
    }

    function stopDrawing() {
        setIsDrawing(false);
    }

    function clearCanvas() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    async function saveSignatureFromCanvas() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL("image/png");
        const url = await uploadToCloudinary(dataUrl);
        if (url) {
            setSignature(url);
            setShowDrawPad(false);
            setSuccess(false);
        }
    }

    async function handleSave() {
        setSaving(true);
        setError("");
        setSuccess(false);

        try {
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ logo, signature }),
            });

            if (!res.ok) {
                const err = await res.json();
                setError(err.error || "Failed to save settings");
            } else {
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
            }
        } catch {
            setError("Failed to save settings");
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="max-w-3xl mx-auto py-6">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <Skeleton className="h-10 w-10 rounded-lg" />
                        <div>
                            <Skeleton className="h-7 w-48 mb-2" />
                            <Skeleton className="h-4 w-64" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
                    <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                        <Skeleton className="h-5 w-5 rounded" />
                        <div>
                            <Skeleton className="h-5 w-32 mb-1" />
                            <Skeleton className="h-3 w-64" />
                        </div>
                    </div>
                    <div className="p-6">
                        <Skeleton className="w-full h-44 rounded-xl" />
                    </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
                    <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                        <Skeleton className="h-5 w-5 rounded" />
                        <div>
                            <Skeleton className="h-5 w-32 mb-1" />
                            <Skeleton className="h-3 w-64" />
                        </div>
                    </div>
                    <div className="p-6 flex gap-4">
                        <Skeleton className="flex-1 h-40 rounded-xl" />
                        <Skeleton className="flex-1 h-40 rounded-xl" />
                    </div>
                </div>

                <div className="flex justify-end">
                    <Skeleton className="h-10 w-40 rounded-md" />
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto py-6">
            {/* Page Header */}
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-gray-900" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>
                        <p className="text-sm text-gray-500">
                            Upload your company logo and signature for invoices
                        </p>
                    </div>
                </div>
            </div>

            {/* Status Messages */}
            {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> {error}
                </div>
            )}
            {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Settings saved successfully!
                </div>
            )}
            {uploading && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading image to cloud...
                </div>
            )}

            {/* Logo Section */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-gray-500" />
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Company Logo</h2>
                        <p className="text-xs text-gray-500">
                            This logo will appear on your invoices. Max 2MB, PNG/JPG/SVG.
                        </p>
                    </div>
                </div>
                <div className="p-6">
                    {logo ? (
                        <div className="flex items-start gap-6">
                            <div className="relative group">
                                <div className="w-40 h-40 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                                    <img
                                        src={logo}
                                        alt="Company Logo"
                                        className="max-w-full max-h-full object-contain p-2"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setLogo(null);
                                        setSuccess(false);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => logoInputRef.current?.click()}
                                    className="flex items-center gap-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    Replace
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div
                            onClick={() => logoInputRef.current?.click()}
                            className="w-full h-44 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-blue-400 flex flex-col items-center justify-center cursor-pointer transition-all group"
                        >
                            <div className="w-14 h-14 rounded-full bg-gray-200 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                                <Upload className="h-6 w-6 text-gray-400 group-hover:text-blue-500 transition-colors" />
                            </div>
                            <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors">
                                Click to upload logo
                            </p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG or SVG (max 2MB)</p>
                        </div>
                    )}
                    <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, setLogo)}
                    />
                </div>
            </div>

            {/* Signature Section */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
                <div className="p-6 border-b border-gray-100 flex items-center gap-3">
                    <PenTool className="h-5 w-5 text-gray-500" />
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">Signature</h2>
                        <p className="text-xs text-gray-500">
                            Upload an image or draw your signature. It will appear on your invoices.
                        </p>
                    </div>
                </div>
                <div className="p-6">
                    {signature && !showDrawPad ? (
                        <div className="flex items-start gap-6">
                            <div className="relative group">
                                <div className="w-64 h-32 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
                                    <img
                                        src={signature}
                                        alt="Signature"
                                        className="max-w-full max-h-full object-contain p-2"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSignature(null);
                                        setSuccess(false);
                                    }}
                                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1.5 rounded-full shadow-md hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => signatureInputRef.current?.click()}
                                    className="flex items-center gap-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    Upload New
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setShowDrawPad(true);
                                        setTimeout(initCanvas, 100);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <PenTool className="h-4 w-4" />
                                    Draw New
                                </Button>
                            </div>
                        </div>
                    ) : showDrawPad ? (
                        <div>
                            <p className="text-sm text-gray-600 mb-3">
                                Draw your signature below using mouse or touch:
                            </p>
                            <div className="relative rounded-xl border-2 border-gray-300 bg-white overflow-hidden">
                                <canvas
                                    ref={canvasRef}
                                    className="w-full cursor-crosshair touch-none"
                                    style={{ height: "180px" }}
                                    onMouseDown={startDrawing}
                                    onMouseMove={draw}
                                    onMouseUp={stopDrawing}
                                    onMouseLeave={stopDrawing}
                                    onTouchStart={startDrawing}
                                    onTouchMove={draw}
                                    onTouchEnd={stopDrawing}
                                />
                                {/* Guideline */}
                                <div className="absolute bottom-12 left-6 right-6 border-b border-dashed border-gray-300 pointer-events-none" />
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={clearCanvas}
                                >
                                    Clear
                                </Button>
                                <Button
                                    size="sm"
                                    className="bg-gray-900 hover:bg-gray-800 text-white"
                                    onClick={saveSignatureFromCanvas}
                                >
                                    Save Signature
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowDrawPad(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex gap-4">
                            <div
                                onClick={() => signatureInputRef.current?.click()}
                                className="flex-1 h-40 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-blue-400 flex flex-col items-center justify-center cursor-pointer transition-all group"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-200 group-hover:bg-blue-100 flex items-center justify-center mb-2 transition-colors">
                                    <Upload className="h-5 w-5 text-gray-400 group-hover:text-blue-500 transition-colors" />
                                </div>
                                <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600 transition-colors">
                                    Upload Image
                                </p>
                                <p className="text-xs text-gray-400 mt-1">PNG or JPG</p>
                            </div>
                            <div
                                onClick={() => {
                                    setShowDrawPad(true);
                                    setTimeout(initCanvas, 100);
                                }}
                                className="flex-1 h-40 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-purple-400 flex flex-col items-center justify-center cursor-pointer transition-all group"
                            >
                                <div className="w-12 h-12 rounded-full bg-gray-200 group-hover:bg-purple-100 flex items-center justify-center mb-2 transition-colors">
                                    <PenTool className="h-5 w-5 text-gray-400 group-hover:text-purple-500 transition-colors" />
                                </div>
                                <p className="text-sm font-medium text-gray-600 group-hover:text-purple-600 transition-colors">
                                    Draw Signature
                                </p>
                                <p className="text-xs text-gray-400 mt-1">Use mouse or touch</p>
                            </div>
                        </div>
                    )}
                    <input
                        ref={signatureInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                            handleFileUpload(e, setSignature);
                            setShowDrawPad(false);
                        }}
                    />
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-8 flex items-center gap-2"
                >
                    {saving ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="h-4 w-4" />
                            Save Settings
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}
