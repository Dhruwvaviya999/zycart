import { ShieldCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDate } from '@/lib/format';
import { fullName, initials, type AuthUser } from '@/types/user';

/** The identity strip every account page opens with. */
export function AccountHeader({ user }: { user: AuthUser }) {
  return (
    <header className="flex flex-wrap items-center gap-4">
      <Avatar className="size-14">
        {user.avatar && <AvatarImage src={user.avatar} alt="" />}
        <AvatarFallback className="bg-brand-subtle text-h4 text-brand">
          {initials(user)}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0">
        <h1 className="text-h2 truncate">{fullName(user)}</h1>
        <p className="text-small truncate text-muted-foreground">
          {user.email} · Member since {formatDate(user.createdAt)}
        </p>
      </div>

      {user.role === 'ADMIN' && (
        <span className="text-caption ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-3 py-1.5 font-semibold text-brand">
          <ShieldCheck className="size-3.5" aria-hidden />
          Administrator
        </span>
      )}
    </header>
  );
}
