import { describe, it, expect } from 'vitest';
import { bootApp, click } from './harness.ts';
import { getStoredConsent } from '../assets/src/analytics.ts';

const BANNER = '#consent-banner';
const ACCEPT = '#consent-accept';
const DECLINE = '#consent-decline';
const MANAGE = '#manage-consent';

describe('consent banner', () => {
  it('renders on first visit when no stored choice exists', async () => {
    await bootApp();
    expect(document.querySelector(BANNER)).not.toBeNull();
    expect(document.querySelector(ACCEPT)).not.toBeNull();
    expect(document.querySelector(DECLINE)).not.toBeNull();
  });

  it('clicking Accept persists `granted` and hides the banner', async () => {
    await bootApp();
    click(ACCEPT);
    expect(document.querySelector(BANNER)).toBeNull();
    expect(getStoredConsent()).toBe('granted');
  });

  it('clicking Decline persists `denied` and hides the banner', async () => {
    await bootApp();
    click(DECLINE);
    expect(document.querySelector(BANNER)).toBeNull();
    expect(getStoredConsent()).toBe('denied');
  });

  it('"Manage analytics consent" link in the footer brings the banner back', async () => {
    await bootApp();
    click(ACCEPT);
    expect(document.querySelector(BANNER)).toBeNull();
    expect(document.querySelector(MANAGE)).not.toBeNull();
    click(MANAGE);
    expect(document.querySelector(BANNER)).not.toBeNull();
    expect(getStoredConsent()).toBeNull();
  });
});
