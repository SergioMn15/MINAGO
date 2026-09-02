(() => {
  const config = window.VIAMINA_CONFIG;

  if (!config || !config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
    throw new Error('Faltan la URL o la clave pública de Supabase en la configuración.');
  }

  window.viaminaSupabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
})();
