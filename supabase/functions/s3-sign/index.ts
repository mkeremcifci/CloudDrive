// Setup via: supabase secrets set --env-file ./supabase/.env.local
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3.513.0";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3.513.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Environment variables
const ACCESS_KEY_ID = Deno.env.get("S3_ACCESS_KEY_ID") ?? "";
const SECRET_ACCESS_KEY = Deno.env.get("S3_SECRET_ACCESS_KEY") ?? "";
const REGION = Deno.env.get("S3_REGION") ?? "eu-central-1";
const BUCKET_NAME = Deno.env.get("S3_BUCKET_NAME") ?? "";

// CORS Headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// S3 Client Authorization
const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    }
});

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verify Authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        throw new Error("Missing Authorization Header");
    }

    const supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { 
            status: 401, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
    }

    // 2. Parse Request
    const { action, fileName, fileType, key } = await req.json();
    // action: "upload" | "download" | "delete"

    if (!action) {
         throw new Error("Missing 'action' parameter");
    }

    let result;

    // 3. Perform Action
    if (action === "upload") {
        if (!fileName || !fileType) throw new Error("Missing fileName or fileType for upload");
        
        // Key Strategy: user_id/timestamp-filename
        const fileKey = `${user.id}/${Date.now()}-${fileName}`;
        
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            ContentType: fileType,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        result = { url: signedUrl, key: fileKey };

    } else if (action === "download") {
        if (!key) throw new Error("Missing 'key' parameter for download");

        // Security check: ensure key belongs to user (primitive check, real security is in DB RLS, here we trust the caller has the key from DB)
        if (!key.startsWith(user.id)) {
            throw new Error("Access denied: You can only access your own files.");
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        result = { url: signedUrl };

    } else if (action === "delete") {
        if (!key) throw new Error("Missing 'key' parameter for delete");

         if (!key.startsWith(user.id)) {
            throw new Error("Access denied: You can only delete your own files.");
        }

        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        await s3Client.send(command);
        result = { success: true };
    } else {
        throw new Error("Invalid action");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
