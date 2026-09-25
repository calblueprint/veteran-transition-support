'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { LuEye, LuEyeOff } from 'react-icons/lu';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import Logger from '@/actions/logging';
import { Button } from '@/components/Button';
import LoadingSpinner from '@/components/LoadingSpinner';
import { Textbox } from '@/components/Textbox';
import { useTimer } from '@/hooks/useTimer';
import { getSupabaseBrowserClient } from '@/lib/supabase';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, 'Passwords must be at least 6 characters')
      .nonoptional(),
    confirmPassword: z
      .string()
      .min(6, 'Passwords must be at least 6 characters')
      .nonoptional(),
  })
  .superRefine((vals, ctx) => {
    if (vals.confirmPassword !== vals.password)
      ctx.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Passwords do not match',
      });
  });

export default function ResetPassword() {
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const router = useRouter();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { cooldownSeconds, startTimer } = useTimer({
    cooldowns: [10],
    onFinish: () => setIsProcessing(false),
  });

  const handleResetPassword = async (password: string) => {
    if (cooldownSeconds > 0) return;

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.auth.updateUser({ password });

    // error: same password
    if (error && error.code === 'same_password') {
      setError('confirmPassword', {
        type: 'validate',
        message: 'Password should be different from old password',
      });
      return;
    }

    // success: redirect to success page + log out
    if (data) {
      // we call sign out to sign out of all sessions (default scope is global)
      // this ensures future logins are only made by users who know the password (i.e. the user)
      await supabase.auth.signOut();
      router.push('?status=success');
    }

    // error: redirect to error page
    if (error) {
      Logger.error(
        `Error occurred while calling updateUser (reset password): ${error.message}`,
      );
      router.push('?status=error');
    }
  };

  const onSubmit = async ({
    password,
  }: z.infer<typeof resetPasswordSchema>) => {
    setIsProcessing(true);
    await handleResetPassword(password);
    startTimer();
  };

  return (
    <form
      className="flex w-106 flex-col gap-7 rounded-2xl bg-gray-1 p-8"
      onSubmit={handleSubmit(onSubmit)}
    >
      <h1 className="text-3xl font-medium">Reset password</h1>

      <div className="flex flex-col gap-4">
        <div className="space-y-6">
          <div className="flex flex-col">
            <p className="text-gray-9">Password</p>
            <div className="relative flex flex-col">
              <div className="relative">
                <Textbox
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  error={errors.password?.message}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <LuEye /> : <LuEyeOff />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <p className="text-gray-9">Confirm password</p>
            <div className="relative flex flex-col">
              <div className="relative">
                <Textbox
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Confirm password"
                  error={errors.confirmPassword?.message}
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
                  aria-label={
                    showConfirmPassword ? 'Hide password' : 'Show password'
                  }
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <LuEye /> : <LuEyeOff />}
                </button>
              </div>
            </div>
          </div>
        </div>
        <Button
          variant="primary"
          type="submit"
          className="mt-7"
          disabled={isProcessing}
        >
          Reset password
          {cooldownSeconds > 0 && ` (${cooldownSeconds} s)`}
          {isProcessing && <LoadingSpinner className="text-gray-1" />}
        </Button>
      </div>
    </form>
  );
}
