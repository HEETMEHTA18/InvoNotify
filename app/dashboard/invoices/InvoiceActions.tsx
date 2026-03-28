import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Download, Mail, Trash2, CheckCircle2, Banknote, MessageSquare } from "lucide-react";
import React from "react";

export function InvoiceActions({ invoice, onEdit, onDelete, onMarkPaid, onReminder, onSendSms, onVoiceCall, onDownload, onRecordPayment }: any) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52 p-1.5">
        <DropdownMenuItem onClick={onEdit} className="py-2.5 text-sm">
          <Pencil className="w-4 h-4 mr-2" /> Edit Invoice
        </DropdownMenuItem>
        <DropdownMenuItem onClick={(e) => {
          e.preventDefault(); // Keep menu open or prevent navigation? No, just good practice sometimes.
          // Actually, we want the menu to close.
          onDownload();
        }} className="py-2.5 text-sm">
          <Download className="w-4 h-4 mr-2" /> Download Invoice
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReminder} className="py-2.5 text-sm">
          <Mail className="w-4 h-4 mr-2" /> Reminder Email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSendSms} className="py-2.5 text-sm">
          <MessageSquare className="w-4 h-4 mr-2" /> Reminder SMS
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="py-2.5 text-sm text-red-600 focus:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" /> Delete Invoice
        </DropdownMenuItem>
        {invoice.status !== "Paid" && (
          <>
            <DropdownMenuItem onClick={onMarkPaid} className="py-2.5 text-sm">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Paid
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRecordPayment} className="py-2.5 text-sm">
              <Banknote className="w-4 h-4 mr-2" /> Record Payment
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
