import { FeedbackButton } from './FeedbackButton';
import { MyPreferencesButton } from './MyPreferencesButton';
import { useAuth } from '../contexts/AuthContext';

export function EditorialActions({ articleUrl }: { articleUrl?: string }) {
    const { user } = useAuth();
    if (user?.role === 'DEMO') return null;
    return <div className="flex items-center gap-1.5 border-l border-editorial-text/15 pl-3" aria-label="Ayuda y ajustes de escritura">
        <FeedbackButton kind="ERROR" articleUrl={articleUrl} />
        <FeedbackButton kind="SUGGESTION" />
        <MyPreferencesButton />
    </div>;
}
