# CloudDrive - Modern S3 File Manager

A secure, serverless file management application built with **React**, **Supabase**, and **AWS S3**.

## Features

- **Secure Authentication**: Email/Password login and registration via Supabase Auth.
- **Direct S3 Uploads**: Files are uploaded directly to AWS S3 using presigned URLs (serverless architecture).
- **Drag & Drop**: Modern UI with drag-and-drop file upload support.
- **Image Previews**: Securely generate signed URLs to preview private images.
- **File Management**: List, search, download, and delete files.
- **Row Level Security (RLS)**: Users can only access their own files. Database policies enforce this at the strict SQL level.
- **Responsive Design**: Built with Tailwind CSS v4, fully responsive and dark-themed.

## Tech Stack

- **Frontend**: React, TypeScript, Vite
- **Styling**: Tailwind CSS v4, Lucide React (Icons)
- **Backend / Auth**: Supabase (PostgreSQL, Auth, Edge Functions)
- **Storage**: AWS S3 (Private Buckets)
- **Runtime**: Deno (for Edge Functions)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd CloudDrive
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Supabase Setup**
   - Create a new Supabase project.
   - Run the SQL commands in `schema.sql` to set up the `files` table and RLS policies.
   - Deploy the Edge Function:
     ```bash
     npx supabase functions deploy s3-sign --no-verify-jwt
     ```
   - Set Edge Function Secrets:
     ```bash
     npx supabase secrets set S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... S3_REGION=... S3_BUCKET_NAME=...
     ```

5. **Run Locally**
   ```bash
   npm run dev
   ```

## Security

- **S3 Access**: keys are NOT stored in the frontend. All S3 operations (Put, Get, Delete) are signed via the standard `s3-sign` Edge Function.
- **RLS**: PostgreSQL Row Level Security policies ensure data isolation between users.
