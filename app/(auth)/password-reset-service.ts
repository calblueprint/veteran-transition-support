import { supabase } from "@/lib/supabase";
import { createPasswordResetLogic } from "./password-reset-logic";

/** One browser-side instance shares the verified recovery grant across steps. */
export const passwordResetService = createPasswordResetLogic(supabase.auth);
