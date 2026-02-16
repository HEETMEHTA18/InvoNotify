import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Pencil, Download, Mail, Trash2, CheckCircle2 } from "lucide-react";
import React from "react";

export function InvoiceActions({ invoice, onEdit, onDelete, onMarkPaid, onReminder, onDownload }: any) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <MoreHorizontal className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="w-4 h-4 mr-2" /> Edit Invoice
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDownload}>
          <Download className="w-4 h-4 mr-2" /> Download Invoice
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onReminder}>
          <Mail className="w-4 h-4 mr-2" /> Reminder Email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDelete} className="text-red-600 focus:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" /> Delete Invoice
        </DropdownMenuItem>
        {invoice.status !== "Paid" && (
          <DropdownMenuItem onClick={onMarkPaid}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Paid
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
