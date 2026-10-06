import { FeedbackButton } from './FeedbackButton';
import { useAuth } from '../contexts/AuthContext';

export function FeedbackActions({ articleUrl }: { articleUrl?: string }) {
    const { user } = useAuth();
    if (user?.role === 'DEMO') return null;
    return <div className="flex items-center gap-1.5" aria-label="Reportar errores y sugerencias">
        <FeedbackButton kind="ERROR" articleUrl={articleUrl} />
        <FeedbackButton kind="SUGGESTION" />
    </div>;
}
