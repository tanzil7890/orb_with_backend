import { SignInButton, SignedIn, SignedOut, UserButton, useUser } from '@clerk/remix';

export function AuthButton() {
  return (
    <div className="flex items-center gap-2">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="px-4 py-2 text-black bg-accent hover:bg-accent/90 rounded-md transition-colors duration-200 font-medium text-sm">
            Sign In
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <UserProfile />
      </SignedIn>
    </div>
  );
}

function UserProfile() {
  const { user } = useUser();

  return (
    <div className="flex items-center gap-3">

      <UserButton
        appearance={{
          elements: {
            avatarBox: 'w-8 h-8',
          },
        }}
      />
      <span className="text-bolt-elements-textPrimary font-medium text-sm">
        {user?.firstName || user?.username || 'User'}
      </span>
    </div>
  );
}
