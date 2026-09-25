import ResetPasswordFlowDecider from '@/components/auth/reset-password/ResetPasswordFlowDecider';

export default function ResetPasswordPage() {
  return (
    <div className="flex size-full flex-col items-center gap-4">
      <div className="flex size-full flex-col items-center justify-center">
        <ResetPasswordFlowDecider />
      </div>
    </div>
  );
}
