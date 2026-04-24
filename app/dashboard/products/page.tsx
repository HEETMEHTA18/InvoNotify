"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Plus,
    Search,
    Trash2,
    Pencil,
    Loader2,
    ShoppingBag,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

type Product = {
    id: number;
    name: string;
    description: string | null;
    basePrice: number;
    hsnCode: string | null;
    defaultTaxRate: number;
};

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [basePrice, setBasePrice] = useState("");
    const [hsnCode, setHsnCode] = useState("");
    const [defaultTaxRate, setDefaultTaxRate] = useState("0");

    useEffect(() => {
        fetchProducts();
    }, []);

    async function fetchProducts() {
        try {
            setLoading(true);
            const res = await fetch("/api/products");
            if (res.ok) {
                const data = await res.json();
                setProducts(data);
            }
        } catch (error) {
            console.error("Failed to fetch products:", error);
        } finally {
            setLoading(false);
        }
    }

    function handleOpenModal(product?: Product) {
        if (product) {
            setEditingProduct(product);
            setName(product.name);
            setDescription(product.description || "");
            setBasePrice(product.basePrice.toString());
            setHsnCode(product.hsnCode || "");
            setDefaultTaxRate(product.defaultTaxRate.toString());
        } else {
            setEditingProduct(null);
            setName("");
            setDescription("");
            setBasePrice("");
            setHsnCode("");
            setDefaultTaxRate("18"); // Default GST
        }
        setIsModalOpen(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        const payload = {
            name,
            description,
            basePrice: parseFloat(basePrice) || 0,
            hsnCode,
            defaultTaxRate: parseFloat(defaultTaxRate) || 0,
        };

        try {
            const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
            const method = editingProduct ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (res.ok) {
                fetchProducts();
                setIsModalOpen(false);
            }
        } catch (error) {
            console.error("Error saving product:", error);
        } finally {
            setSubmitting(false);
        }
    }

    async function handleDelete(id: number) {
        if (!confirm("Are you sure you want to delete this product?")) return;

        try {
            const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
            if (res.ok) {
                setProducts(products.filter((p) => p.id !== id));
            }
        } catch (error) {
            console.error("Error deleting product:", error);
        }
    }

    const filteredProducts = products.filter((p) =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.hsnCode && p.hsnCode.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Products & Services</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Manage your item catalog for quick invoicing
                    </p>
                </div>
                <Button onClick={() => handleOpenModal()} className="bg-gray-900 hover:bg-gray-800 text-white gap-2">
                    <Plus className="h-4 w-4" />
                    Add Product
                </Button>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search products by name or HSN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Item</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">HSN</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Price</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">GST Rate</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-4">
                                            <Skeleton className="h-4 w-40 mb-1.5" />
                                            <Skeleton className="h-3 w-56" />
                                        </td>
                                        <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                                        <td className="px-6 py-4 text-right"><Skeleton className="h-4 w-20 ml-auto" /></td>
                                        <td className="px-6 py-4 text-center"><Skeleton className="h-5 w-12 rounded mx-auto" /></td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Skeleton className="h-7 w-7 rounded-lg" />
                                                <Skeleton className="h-7 w-7 rounded-lg" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                                            <ShoppingBag className="h-6 w-6 text-gray-400" />
                                        </div>
                                        <p className="text-sm text-gray-500">No products found.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredProducts.map((product) => (
                                    <tr key={product.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="text-sm font-semibold text-gray-900">{product.name}</p>
                                                {product.description && (
                                                    <p className="text-xs text-gray-500 truncate max-w-xs">{product.description}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">{product.hsnCode || "-"}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                                            ₹{Number(product.basePrice).toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                                {product.defaultTaxRate}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => handleOpenModal(product)}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(product.id)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Product Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-[425px]" aria-describedby={undefined}>
                    <DialogHeader>
                        <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 py-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Product Name</label>
                            <input
                                required
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Steel Pipe 2 inch"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Description (Optional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Product details..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                rows={2}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Base Price</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        value={basePrice}
                                        onChange={(e) => setBasePrice(e.target.value)}
                                        placeholder="0.00"
                                        className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">HSN Code</label>
                                <input
                                    value={hsnCode}
                                    onChange={(e) => setHsnCode(e.target.value)}
                                    placeholder="HSN"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Default GST Rate (%)</label>
                            <select
                                value={defaultTaxRate}
                                onChange={(e) => setDefaultTaxRate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                            >
                                <option value="0">0% (Exempt)</option>
                                <option value="5">5%</option>
                                <option value="12">12%</option>
                                <option value="18">18%</option>
                                <option value="28">28%</option>
                            </select>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setIsModalOpen(false)}
                                disabled={submitting}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                className="bg-gray-900 hover:bg-gray-800 text-white"
                                disabled={submitting}
                            >
                                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                {editingProduct ? "Save Changes" : "Add Product"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
