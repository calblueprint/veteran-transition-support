import ForgotPasswordFlowDecider from '@/components/auth/forgot-password/ForgotPasswordFlowDecider';

export default function ForgotPasswordPage() {
  return (
    <div className="flex size-full flex-col items-center gap-4">
      <div className="flex size-full flex-col items-center justify-center">
        <ForgotPasswordFlowDecider />
      </div>
    </div>
  );
}
