process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

test("exports a supabase client with auth configured", () => {
  const { supabase } = require("../supabase");
  expect(supabase).toBeDefined();
  expect(typeof supabase.auth.getSession).toBe("function");
});
