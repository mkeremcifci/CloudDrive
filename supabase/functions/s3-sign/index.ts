import { createClient } from 'jsr:@supabase/supabase-js@2'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.513.0'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.513.0'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // 0. Handle CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Configuration Check
        const S3_ACCESS_KEY_ID = Deno.env.get('S3_ACCESS_KEY_ID');
        const S3_SECRET_ACCESS_KEY = Deno.env.get('S3_SECRET_ACCESS_KEY');
        const S3_REGION = Deno.env.get('S3_REGION');
        const S3_BUCKET_NAME = Deno.env.get('S3_BUCKET_NAME');
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
        const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_REGION || !S3_BUCKET_NAME) {
            throw new Error("Server configuration error: Missing S3 secrets.");
        }

        // 2. Initialize Clients
        const s3Client = new S3Client({
            region: S3_REGION,
            credentials: {
                accessKeyId: S3_ACCESS_KEY_ID,
                secretAccessKey: S3_SECRET_ACCESS_KEY,
            },
        });

        // Admin client for checking shared links (bypasses RLS)
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Client with user's auth context
        const authHeader = req.headers.get('Authorization');
        const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader ?? '' } }
        });

        // 3. Get User (Soft check - don't throw yet)
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

        // 4. Parse Request
        const { action, fileName, fileType, key, token } = await req.json();
        let result;

        // 5. Action Handlers
        if (action === 'public_download') {
            // Public Link Logic - No User Auth Required from Request
            if (!token) throw new Error("Token required");

            const { data: linkData, error: linkError } = await supabaseAdmin
                .from('shared_links')
                .select('file_id, expires_at')
                .eq('token', token)
                .single();

            if (linkError || !linkData) throw new Error('Invalid or expired link');
            if (new Date(linkData.expires_at) < new Date()) throw new Error('Link expired');

            const { data: fileData, error: fileError } = await supabaseAdmin
                .from('files')
                .select('s3_key, name, size, mime_type')
                .eq('id', linkData.file_id)
                .single();

            if (fileError || !fileData) throw new Error('File not found');

            // Force Download for Public Links
            const encodedName = encodeURIComponent(fileData.name);
            const command = new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: fileData.s3_key,
                ResponseContentDisposition: `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
                ResponseContentType: 'application/octet-stream' // Force download
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
            result = { url, file: fileData };

        } else {
            // Private Actions - Require Valid User
            if (userError || !user) {
                // Return 401 only here, where it is strictly required
                console.error("Auth Error:", userError);
                return new Response(JSON.stringify({ error: "Unauthorized" }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 401,
                });
            }

            if (action === 'upload') {
                const fileKey = `${user.id}/${Date.now()}-${fileName}`;
                const command = new PutObjectCommand({
                    Bucket: S3_BUCKET_NAME,
                    Key: fileKey,
                    ContentType: fileType,
                });
                const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                result = { url, key: fileKey };

            } else if (action === 'download') {
                if (!key.startsWith(user.id)) throw new Error("Unauthorized access to file");

                const commandInput: any = { Bucket: S3_BUCKET_NAME, Key: key };

                // CRITICAL: Only force download header if 'fileName' is provided (e.g. from Download Button)
                // If fileName is missing (Thumbnail), use default S3 behavior (inline)
                if (fileName) {
                    const encodedName = encodeURIComponent(fileName);
                    commandInput.ResponseContentDisposition = `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`;
                    commandInput.ResponseContentType = 'application/octet-stream';
                }

                const command = new GetObjectCommand(commandInput);
                const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                result = { url };

            } else if (action === 'delete') {
                if (!key.startsWith(user.id)) throw new Error("Unauthorized access to file");
                const command = new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key });
                await s3Client.send(command);
                result = { success: true };
            } else {
                throw new Error(`Unknown action: ${action}`);
            }
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error("Function Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
