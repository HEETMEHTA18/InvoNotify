"use client";

import { Button } from "@/components/ui/button";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

export function SubmitButton()
{
    const { pending } = useFormStatus();
    return(
        <>
        {/* <Button disabled className="w-full"><Loader2 className="size-4 mr-2 animate-spin" />Please wait...</Button> */}
        {!pending ? <Button type="submit" className="w-full">Submit</Button> : null}
        </>
    )
}