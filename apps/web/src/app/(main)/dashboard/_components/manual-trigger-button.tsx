'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export function ManualTriggerButton() {
  const [loading, setLoading] = useState(false);

  const handleTrigger = async () => {
    // Confirm action
    const confirmed = confirm('This will check all products and send a digest email. Continue?');
    if (!confirmed) {
      return;
    }

    // Get credentials
    const username = prompt('Admin username:');
    const password = prompt('Admin password:');

    if (!username || !password) {
      toast.error('Authentication cancelled', {
        description: 'Username and password are required',
      });
      return;
    }

    setLoading(true);

    try {
      const credentials = btoa(`${username}:${password}`);

      const response = await fetch('/api/digest/trigger', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${credentials}`,
        },
      });

      // Handle non-JSON responses (e.g., HTML error pages from proxies/gateways)
      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        // If JSON parsing fails, it's likely an HTML error page or network issue
        toast.error('Failed to trigger digest', {
          description: `Server returned invalid response (HTTP ${response.status})`,
        });
        return;
      }

      if (response.ok) {
        toast.success('Digest triggered successfully!', {
          description: 'All products will be checked and email will be sent.',
        });
      } else {
        toast.error('Failed to trigger digest', {
          description: data.error || 'Unknown error occurred',
        });
      }
    } catch (error) {
      toast.error('Failed to trigger digest', {
        description: error instanceof Error ? error.message : 'Network error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleTrigger}
      disabled={loading}
      className="gap-2"
      size="lg"
    >
      <Mail className="size-4" />
      {loading ? 'Triggering...' : 'Check All & Send Email'}
    </Button>
  );
}
