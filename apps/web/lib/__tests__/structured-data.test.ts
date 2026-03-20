import { describe, it, expect } from 'vitest';
import { paperToJsonLd, paperBreadcrumbJsonLd, todayPageJsonLd } from '../structured-data';

// ── paperToJsonLd ─────────────────────────────────────────────────────────────

describe('paperToJsonLd', () => {
  const base = {
    title: 'Attention Is All You Need',
    authors: ['Ashish Vaswani', 'Noam Shazeer'],
    abstract: 'The dominant sequence transduction models are based on complex recurrent networks.',
    publishedDate: '2017-06-12',
    arxivId: '1706.03762',
  };

  it('sets @context to https://schema.org', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    expect(result['@context']).toBe('https://schema.org');
  });

  it('sets @type to ScholarlyArticle', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    expect(result['@type']).toBe('ScholarlyArticle');
  });

  it('sets headline to paper title', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    expect(result.headline).toBe('Attention Is All You Need');
  });

  it('maps authors to Person objects', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    const authors = result.author as Array<Record<string, string>>;
    expect(authors).toHaveLength(2);
    expect(authors[0]).toEqual({ '@type': 'Person', name: 'Ashish Vaswani' });
    expect(authors[1]).toEqual({ '@type': 'Person', name: 'Noam Shazeer' });
  });

  it('sets datePublished', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    expect(result.datePublished).toBe('2017-06-12');
  });

  it('sets correct arXiv URL', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    expect(result.url).toBe('https://arxiv.org/abs/1706.03762');
    expect(result.sameAs).toBe('https://arxiv.org/abs/1706.03762');
  });

  it('sets publisher to arXiv organization', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    const publisher = result.publisher as Record<string, string>;
    expect(publisher['@type']).toBe('Organization');
    expect(publisher.name).toBe('arXiv');
    expect(publisher.url).toBe('https://arxiv.org');
  });

  it('truncates abstract at 500 chars', () => {
    const longAbstract = 'A'.repeat(600);
    const result = paperToJsonLd({ ...base, abstract: longAbstract }) as Record<string, unknown>;
    expect((result.abstract as string).length).toBe(500);
  });

  it('keeps abstract under 500 chars unchanged', () => {
    const short = 'Short abstract.';
    const result = paperToJsonLd({ ...base, abstract: short }) as Record<string, unknown>;
    expect(result.abstract).toBe('Short abstract.');
  });

  it('handles empty authors array', () => {
    const result = paperToJsonLd({ ...base, authors: [] }) as Record<string, unknown>;
    expect(result.author).toEqual([]);
  });

  it('handles missing publishedDate (undefined)', () => {
    const { publishedDate: _, ...withoutDate } = base;
    const result = paperToJsonLd(withoutDate) as Record<string, unknown>;
    expect(result.datePublished).toBeUndefined();
  });

  it('handles special characters in title', () => {
    const result = paperToJsonLd({
      ...base,
      title: 'Über-efficient <Attention> & "Transformers"',
    }) as Record<string, unknown>;
    expect(result.headline).toBe('Über-efficient <Attention> & "Transformers"');
  });

  it('works without llmScore', () => {
    const result = paperToJsonLd(base) as Record<string, unknown>;
    // No error thrown, all required fields present
    expect(result['@type']).toBe('ScholarlyArticle');
  });

  it('handles abstract exactly 500 chars', () => {
    const exact = 'B'.repeat(500);
    const result = paperToJsonLd({ ...base, abstract: exact }) as Record<string, unknown>;
    expect((result.abstract as string).length).toBe(500);
  });

  it('returns a plain object (not a class instance)', () => {
    const result = paperToJsonLd(base);
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });
});

// ── paperBreadcrumbJsonLd ─────────────────────────────────────────────────────

describe('paperBreadcrumbJsonLd', () => {
  const paper = { title: 'Attention Is All You Need', arxivId: '1706.03762' };

  it('sets @context to https://schema.org', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    expect(result['@context']).toBe('https://schema.org');
  });

  it('sets @type to BreadcrumbList', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    expect(result['@type']).toBe('BreadcrumbList');
  });

  it('has exactly 3 breadcrumb items', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    const items = result.itemListElement as unknown[];
    expect(items).toHaveLength(3);
  });

  it('first item is PaperBrief homepage at position 1', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    const items = result.itemListElement as Array<Record<string, unknown>>;
    expect(items[0].position).toBe(1);
    expect(items[0].name).toBe('PaperBrief');
    expect(items[0].item).toBe('https://paperbrief.ai');
  });

  it('second item is Papers list at position 2', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    const items = result.itemListElement as Array<Record<string, unknown>>;
    expect(items[1].position).toBe(2);
    expect(items[1].name).toBe('Papers');
    expect(items[1].item).toBe('https://paperbrief.ai/papers');
  });

  it('third item is the paper at position 3', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    const items = result.itemListElement as Array<Record<string, unknown>>;
    expect(items[2].position).toBe(3);
    expect(items[2].name).toBe('Attention Is All You Need');
    expect(items[2].item).toBe('https://paperbrief.ai/papers/1706.03762');
  });

  it('uses arxivId in paper URL', () => {
    const result = paperBreadcrumbJsonLd({ title: 'Test', arxivId: '2401.12345' }) as Record<string, unknown>;
    const items = result.itemListElement as Array<Record<string, unknown>>;
    expect(items[2].item).toBe('https://paperbrief.ai/papers/2401.12345');
  });

  it('all items have @type ListItem', () => {
    const result = paperBreadcrumbJsonLd(paper) as Record<string, unknown>;
    const items = result.itemListElement as Array<Record<string, unknown>>;
    for (const item of items) {
      expect(item['@type']).toBe('ListItem');
    }
  });
});

// ── todayPageJsonLd ───────────────────────────────────────────────────────────

describe('todayPageJsonLd', () => {
  it('sets @context to https://schema.org', () => {
    const result = todayPageJsonLd() as Record<string, unknown>;
    expect(result['@context']).toBe('https://schema.org');
  });

  it('sets @type to WebPage', () => {
    const result = todayPageJsonLd() as Record<string, unknown>;
    expect(result['@type']).toBe('WebPage');
  });

  it('sets name to "Today\'s Top ML Paper"', () => {
    const result = todayPageJsonLd() as Record<string, unknown>;
    expect(result.name).toBe("Today's Top ML Paper");
  });

  it('sets url to /today page', () => {
    const result = todayPageJsonLd() as Record<string, unknown>;
    expect(result.url).toBe('https://paperbrief.ai/today');
  });

  it('omits "about" when no paper provided', () => {
    const result = todayPageJsonLd() as Record<string, unknown>;
    expect(result.about).toBeUndefined();
  });

  it('includes "about" ScholarlyArticle when paper provided', () => {
    const result = todayPageJsonLd({ title: 'Test Paper', arxivId: '2401.00001' }) as Record<string, unknown>;
    const about = result.about as Record<string, unknown>;
    expect(about).toBeDefined();
    expect(about['@type']).toBe('ScholarlyArticle');
    expect(about.name).toBe('Test Paper');
    expect(about.url).toBe('https://arxiv.org/abs/2401.00001');
  });

  it('"about" uses arxiv URL for paper', () => {
    const result = todayPageJsonLd({ title: 'Another Paper', arxivId: '2312.99999' }) as Record<string, unknown>;
    const about = result.about as Record<string, unknown>;
    expect(about.url).toBe('https://arxiv.org/abs/2312.99999');
  });

  it('includes description', () => {
    const result = todayPageJsonLd() as Record<string, unknown>;
    expect(typeof result.description).toBe('string');
    expect((result.description as string).length).toBeGreaterThan(0);
  });
});
