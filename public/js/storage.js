// STORAGE SYSTEM — FULL SUPABASE VERSION
// Semua file (PDF, gambar, dokumen) disimpan ke Supabase Storage (bucket: documents)

async function uploadFileToSupabase(file, path) {
  const { data, error } = await supabase.storage
    .from('documents')
    .upload(path, file, {
      upsert: true,
      cacheControl: '3600'
    });

  if (error) {
    console.error("Upload error:", error);
    throw error;
  }
  // Get public URL
  const { data: urlData } = supabase.storage
    .from('documents')
    .getPublicUrl(path);

  return urlData.publicUrl;
}

async function deleteFileFromSupabase(path) {
  const { error } = await supabase.storage
    .from('documents')
    .remove([path]);

  if (error) {
    console.error("Delete error:", error);
    throw error;
  }
}

async function listFilesFromSupabase(prefix = '') {
  const { data, error } = await supabase.storage
    .from('documents')
    .list(prefix, {
      limit: 300,
      sortBy: { column: "name", order: "asc" }
    });

  if (error) {
    console.error("List error:", error);
    return [];
  }

  return data;
}

// GLOBAL API
window.Storage = {
  upload: uploadFileToSupabase,
  delete: deleteFileFromSupabase,
  list: listFilesFromSupabase
};