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
  Zap,
} from "lucide-react";
import { toast } from "sonner";

export default function WhatsAppPage() {
  const [configStatus, setConfigStatus] = useState<"configured" | "not_configured" | "checking">("checking");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConfig();
  }, []);

  async function checkConfig() {
    try {
      const res = await fetch("/api/ai/health");
      if (res.ok) {
        const data = await res.json();
        setConfigStatus(data.whatsapp?.configured ? "configured" : "not_configured");
      } else {
        setConfigStatus("not_configured");
      }
    } catch {
      setConfigStatus("not_configured");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          WhatsApp Channel
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Meta Cloud API integration for high-open-rate customer communication
        </p>
      </div>

      {/* Config Status */}
      <Card
        className={
          configStatus === "configured"
            ? "border-green-200 bg-green-50"
            : configStatus === "not_configured"
            ? "border-yellow-200 bg-yellow-50"
            : ""
        }
      >
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
                    Set <code className="bg-yellow-100 px-1 rounded">WHATSAPP_PHONE_NUMBER_ID</code> and{" "}
                    <code className="bg-yellow-100 px-1 rounded">WHATSAPP_ACCESS_TOKEN</code> in your Vercel environment.
                  </p>
                  <a
                    href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1 mt-2"
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

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <Zap className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium">Free Customer Service Messages</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Within 24 hours of last customer message, send unlimited free messages. Perfect for payment reminders.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Send className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium">Template Messages</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Pre-approved templates for payment reminders, receipts, and follow-ups. Works outside 24h window.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <Phone className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium">98% Open Rate</h3>
                <p className="text-sm text-gray-600 mt-1">
                  WhatsApp messages have 98% open rates vs 20% for email. Reach customers where they are.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-medium">Delivery Tracking</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Real-time delivery and read receipts. Know exactly when customers see your reminders.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* How It Integrates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">How WhatsApp Integrates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                1
              </div>
              <div>
                <p className="font-medium">Multi-Channel Delivery</p>
                <p className="text-sm text-gray-600">
                  When the AI sends a reminder, it automatically sends via both Email AND WhatsApp simultaneously for maximum reach.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                2
              </div>
              <div>
                <p className="font-medium">Payment Link in Message</p>
                <p className="text-sm text-gray-600">
                  Each WhatsApp message includes a Razorpay payment link. Customer taps to pay — no friction.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-600">
                3
              </div>
              <div>
                <p className="font-medium">Automatic Channel Selection</p>
                <p className="text-sm text-gray-600">
                  The decision agent automatically selects WhatsApp when the customer has a phone number and WhatsApp is configured.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Instructions */}
      {configStatus === "not_configured" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex gap-2">
                <span className="font-bold text-blue-600">1.</span>
                Create a Meta Business account at{" "}
                <a href="https://business.facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  business.facebook.com
                </a>
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600">2.</span>
                Set up WhatsApp Business API in the Meta Developer Console
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600">3.</span>
                Get your Phone Number ID and Access Token
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-blue-600">4.</span>
                Add to Vercel environment variables:
                <code className="bg-gray-100 px-2 rounded text-xs">
                  WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN
                </code>
              </li>
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
