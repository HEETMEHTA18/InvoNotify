"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Send,
  CheckCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Phone,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type WhatsAppMessage = {
  id: string;
  to: string;
  status: "sent" | "delivered" | "read" | "failed";
  type: "text" | "template" | "payment_reminder";
  content: string;
  invoiceNumber?: string;
  sentAt: string;
};

export default function WhatsAppPage() {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [configStatus, setConfigStatus] = useState<"configured" | "not_configured" | "checking">("checking");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    checkConfig();
  }, []);

  async function checkConfig() {
    try {
      const res = await fetch("/api/ai/health");
      if (res.ok) {
        const data = await res.json();
        setConfigStatus(data.whatsapp?.configured ? "configured" : "not_configured");
      }
    } catch {
      setConfigStatus("not_configured");
    } finally {
      setLoading(false);
    }
  }

  async function sendTestMessage() {
    const phone = window.prompt("Enter phone number (e.g. +919876543210):");
    if (!phone) return;

    setSending(true);
    try {
      const res = await fetch("/api/reminders/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "WHATSAPP",
          phone,
          message: "This is a test message from InvoNotify. Your payment is due.",
        }),
      });

      if (res.ok) {
        toast.success("Test message sent!");
      } else {
        const err = await res.json();
        toast.error(err.error || "Failed to send");
      }
    } catch {
      toast.error("Failed to send test message");
    } finally {
      setSending(false);
    }
  }

  const stats = {
    sent: messages.filter((m) => m.status === "sent" || m.status === "delivered" || m.status === "read").length,
    delivered: messages.filter((m) => m.status === "delivered" || m.status === "read").length,
    read: messages.filter((m) => m.status === "read").length,
    failed: messages.filter((m) => m.status === "failed").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="h-6 w-6" />
            WhatsApp Channel
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Meta Cloud API integration for high-open-rate customer communication
          </p>
        </div>
        <Button onClick={sendTestMessage} disabled={sending || configStatus !== "configured"}>
          {sending ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Send Test
        </Button>
      </div>

      {/* Config Status */}
      <Card className={configStatus === "configured" ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {configStatus === "configured" ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-800">WhatsApp Cloud API Configured</p>
                  <p className="text-sm text-green-600">
                    Messages are sent via Meta Business Platform. Free within 24h customer service window.
                  </p>
                </div>
              </>
            ) : configStatus === "not_configured" ? (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="font-medium text-yellow-800">WhatsApp Not Configured</p>
                  <p className="text-sm text-yellow-600">
                    Set <code>WHATSAPP_PHONE_NUMBER_ID</code> and <code>WHATSAPP_ACCESS_TOKEN</code> in your environment.
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-1"
                  >
                    Setup Guide <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </>
            ) : (
              <>
                <Clock className="h-5 w-5 text-gray-400" />
                <p className="text-gray-500">Checking configuration...</p>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.sent}</p>
                <p className="text-xs text-gray-500">Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.delivered}</p>
                <p className="text-xs text-gray-500">Delivered</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <MessageSquare className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.read}</p>
                <p className="text-xs text-gray-500">Read</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failed}</p>
                <p className="text-xs text-gray-500">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">WhatsApp Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Free Customer Service Messages
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Within 24 hours of last customer message, send unlimited free messages. Perfect for payment reminders.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium flex items-center gap-2">
                <Send className="h-4 w-4" />
                Template Messages
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Pre-approved templates for payment reminders, receipts, and follow-ups. Works outside 24h window.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                98% Open Rate
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                WhatsApp messages have 98% open rates vs 20% for email. Reach customers where they are.
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Delivery Tracking
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Real-time delivery and read receipts. Know exactly when customers see your reminders.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Message Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No WhatsApp messages sent yet. Messages are sent automatically when recovery actions are executed.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2 font-medium text-gray-600">To</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Type</th>
                    <th className="text-left py-3 px-2 font-medium text-gray-600">Content</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Status</th>
                    <th className="text-center py-3 px-2 font-medium text-gray-600">Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {messages.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium">{m.to}</td>
                      <td className="py-3 px-2">
                        <Badge className="bg-gray-100 text-gray-800 border-0 text-xs">{m.type}</Badge>
                      </td>
                      <td className="py-3 px-2 text-gray-600 max-w-[200px] truncate">{m.content}</td>
                      <td className="py-3 px-2 text-center">
                        <Badge
                          className={`border-0 text-xs ${
                            m.status === "read"
                              ? "bg-purple-100 text-purple-800"
                              : m.status === "delivered"
                              ? "bg-green-100 text-green-800"
                              : m.status === "failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-blue-100 text-blue-800"
                          }`}
                        >
                          {m.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center text-xs text-gray-500">
                        {new Date(m.sentAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
