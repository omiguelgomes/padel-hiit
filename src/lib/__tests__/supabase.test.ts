process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

describe("supabase client", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function loadModule(platformOS: string) {
    const createClient = jest.fn(() => ({ auth: { getSession: jest.fn() } }));
    jest.doMock("@supabase/supabase-js", () => ({ createClient }));
    jest.doMock("react-native", () => ({ Platform: { OS: platformOS } }));
    const { supabase } = require("../supabase");
    return { supabase, createClient };
  }

  test("exports a supabase client", () => {
    const { supabase } = loadModule("ios");
    expect(supabase).toBeDefined();
    expect(typeof supabase.auth.getSession).toBe("function");
  });

  test("on native: passes persistSession=true, autoRefreshToken=true, detectSessionInUrl=false", () => {
    const { createClient } = loadModule("ios");
    const [, , opts] = createClient.mock.calls[0] as any[];
    expect(opts.auth.persistSession).toBe(true);
    expect(opts.auth.autoRefreshToken).toBe(true);
    expect(opts.auth.detectSessionInUrl).toBe(false);
  });

  test("on native: passes a LargeSecureStore as storage", () => {
    const { createClient } = loadModule("ios");
    const [, , opts] = createClient.mock.calls[0] as any[];
    expect(opts.auth.storage).toBeDefined();
    expect(typeof opts.auth.storage.getItem).toBe("function");
    expect(typeof opts.auth.storage.setItem).toBe("function");
    expect(typeof opts.auth.storage.removeItem).toBe("function");
  });

  test("on web: omits custom storage (default localStorage)", () => {
    const { createClient } = loadModule("web");
    const [, , opts] = createClient.mock.calls[0] as any[];
    expect(opts.auth.persistSession).toBe(true);
    expect(opts.auth.autoRefreshToken).toBe(true);
    expect(opts.auth.detectSessionInUrl).toBe(false);
    expect(opts.auth.storage).toBeUndefined();
  });
});
