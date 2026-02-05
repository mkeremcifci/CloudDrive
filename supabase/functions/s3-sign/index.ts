import { createClient } from 'jsr:@supabase/supabase-js@2'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from 'npm:@aws-sdk/client-s3@3.513.0'
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.513.0'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const S3_ACCESS_KEY_ID = Deno.env.get('S3_ACCESS_KEY_ID');
        const S3_SECRET_ACCESS_KEY = Deno.env.get('S3_SECRET_ACCESS_KEY');
        const S3_REGION = Deno.env.get('S3_REGION');
        const S3_BUCKET_NAME = Deno.env.get('S3_BUCKET_NAME');

        if (!S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_REGION || !S3_BUCKET_NAME) {
            throw new Error("Server configuration error: Missing S3 secrets.");
        }

        const s3Client = new S3Client({
            region: S3_REGION,
            credentials: {
                accessKeyId: S3_ACCESS_KEY_ID,
                secretAccessKey: S3_SECRET_ACCESS_KEY,
            },
        });

        // Use Service Role for DB operations to bypass RLS when needed (handling permissions manually)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Standard Auth check (still needed for upload/delete/private download)
        const authHeader = req.headers.get('Authorization')
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: authHeader ?? '' } } }
        )
        const { data: { user } } = await supabaseClient.auth.getUser()

        const { action, fileName, fileType, key, token } = await req.json()
        let result

        if (action === 'public_download') {
            if (!token) throw new Error("Token required");

            // 1. Validate Token
            const { data: linkData, error: linkError } = await supabaseAdmin
                .from('shared_links')
                .select('file_id, expires_at')
                .eq('token', token)
                .single();

            if (linkError || !linkData) throw new Error('Invalid or expired link');
            if (new Date(linkData.expires_at) < new Date()) throw new Error('Link expired');

            // 2. Get File Info
            const { data: fileData, error: fileError } = await supabaseAdmin
                .from('files')
                .select('s3_key, name, size, mime_type')
                .eq('id', linkData.file_id)
                .single();

            if (fileError || !fileData) throw new Error('File not found');

            // 3. Generate URL
            const command = new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: fileData.s3_key })
            const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })


            result = { url, file: fileData }

        } else {
            // All other actions require Authentication
            if (!user) throw new Error("Unauthorized");

            if (action === 'upload') {
                const fileKey = `${user.id}/${Date.now()}-${fileName}`
                const command = new PutObjectCommand({
                    Bucket: S3_BUCKET_NAME,
                    Key: fileKey,
                    ContentType: fileType,
                })
                const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
                result = { url, key: fileKey }

            } else if (action === 'download') {
                if (!key.startsWith(user.id)) throw new Error("Unauthorized access to file")
                const command = new GetObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key })
                const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
                result = { url }

            } else if (action === 'delete') {
                if (!key.startsWith(user.id)) throw new Error("Unauthorized access to file")
                const command = new DeleteObjectCommand({ Bucket: S3_BUCKET_NAME, Key: key })
                await s3Client.send(command)
                result = { success: true }
            } else {
                throw new Error(`Unknown action: ${action}`)
            }
        }

        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error) {
        console.error(error)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
