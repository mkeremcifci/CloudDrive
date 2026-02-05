import { useEffect, useState } from 'react';
import { File, Image as ImageIcon } from 'lucide-react';

interface FileItem {
    name: string;
    mime_type: string;
    s3_key: string;
}

interface FileThumbnailProps {
    file: FileItem;
    session: any;
    iconOnly?: boolean;
}

export const FileThumbnail = ({ file, session, iconOnly }: FileThumbnailProps) => {
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        // Only fetch for images
        if (!file.mime_type.startsWith('image/') || iconOnly) return;

        let mounted = true;
        const fetchPreview = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/s3-sign`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'download', // We use download link as preview
                        key: file.s3_key,
                    }),
                });

                if (response.ok) {
                    const { url } = await response.json();
                    if (mounted) setImageUrl(url);
                }
            } catch (e) {
                console.error('Preview error', e);
            }
        };

        fetchPreview();

        return () => { mounted = false; };
    }, [file.s3_key, file.mime_type, session.access_token, iconOnly]);

    if (imageUrl && !iconOnly) {
        return <img src={imageUrl} alt={file.name} className="w-full h-full object-cover rounded-xl" />;
    }

    return (
        <div className={`w-full h-full flex items-center justify-center ${iconOnly ? '' : 'p-3 rounded-xl'} ${file.mime_type.includes('image') ? (iconOnly ? 'text-purple-400' : 'bg-purple-500/20 text-purple-400') : (iconOnly ? 'text-blue-400' : 'bg-blue-500/20 text-blue-400')}`}>
            {file.mime_type.includes('image') ? <ImageIcon className={iconOnly ? "w-5 h-5" : "w-8 h-8"} /> : <File className={iconOnly ? "w-5 h-5" : "w-8 h-8"} />}
        </div>
    );
};
