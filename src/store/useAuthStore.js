import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../api/supabaseClient';
import { idbStorage } from './idb-storage';

export const useAuthStore = create(
  persist(
    (set) => ({
      isLoggedIn: false,
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      licenseKey: null,
      storeUrl: null,
      wcConsumerKey: null,
      wcConsumerSecret: null,
      storeName: null,
      storePhone: '',
      storeAddress: '',
      isLoading: false,
      error: null,

      updateProfile: (phone, address) => {
        set({ storePhone: phone, storeAddress: address });
      },

      loginWithLicenseKey: async (key) => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('license_key', key)
            .single();

          if (error) {
            console.error('Supabase Login Error:', error);
            set({ error: `Error: ${error.message || error.details || 'Invalid key'}`, isLoading: false });
            return false;
          }

          if (data.status !== 'active') {
            set({ error: 'License is suspended or inactive.', isLoading: false });
            return false;
          }

          set((state) => ({
            isLoggedIn: true,
            licenseKey: data.license_key,
            storeUrl: data.wc_url,
            wcConsumerKey: data.wc_consumer_key,
            wcConsumerSecret: data.wc_consumer_secret,
            storeName: data.store_name,
            // DO NOT OVERWRITE PHONE AND ADDRESS ON LOGIN if they already exist in local storage.
            // But since this is a set, it will preserve them if we don't overwrite them. 
            // Wait, zustand set merges shallowly, so we don't need to specify phone/address here.
            isLoading: false,
            error: null,
          }));
          return true;
        } catch (err) {
          set({ error: 'An unexpected error occurred.', isLoading: false });
          return false;
        }
      },

      logout: () => {
        set({
          isLoggedIn: false,
          licenseKey: null,
          storeUrl: null,
          wcConsumerKey: null,
          wcConsumerSecret: null,
          storeName: null,
        });
      },
    }),
    {
      name: 'pos-auth-store',
      storage: createJSONStorage(() => idbStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
