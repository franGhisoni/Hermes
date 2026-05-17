export interface ProviderSearchResult {
    // Public URL for the search page (used in the admin trace so an editor can
    // click through and see what the engine actually returned).
    url: string;
    // Direct URLs to the image files surfaced by the provider.
    results: string[];
    // Which underlying engine surfaced each URL. Keys are URLs in `results`.
    // Examples: 'searxng-google', 'searxng-bing', 'searxng-duckduckgo'.
    engineByUrl: Record<string, string>;
}

export interface ImageSearchOptions {
    minWidth?: number;
    minHeight?: number;
}

export interface ImageSearchProvider {
    readonly name: string;
    search(query: string, options?: ImageSearchOptions): Promise<ProviderSearchResult>;
}
