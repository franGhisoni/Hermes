import { FeedbackButton } from './FeedbackButton';
import { MyPreferencesButton } from './MyPreferencesButton';

export function EditorialActions({ articleUrl }: { articleUrl?: string }) {
    return <div className="flex items-center gap-1.5 border-l border-editorial-text/15 pl-3" aria-label="Ayuda y ajustes de escritura">
        <FeedbackButton kind="ERROR" articleUrl={articleUrl} />
        <FeedbackButton kind="SUGGESTION" />
        <MyPreferencesButton />
    </div>;
}
