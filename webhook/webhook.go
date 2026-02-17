package webhook

import (
	"context"
	"fmt"
	"net/http"
)

type WebhookManager struct {
	client *http.Client
	opts   *WebhookOptions
}

type WebhookOptions struct {
	Url     string
	Headers map[string]string
}

func NewManager(opts *WebhookOptions) *WebhookManager {
	return &WebhookManager{
		client: &http.Client{},
		opts:   opts,
	}
}

func (m *WebhookManager) Send(ctx context.Context) error {
	if m.opts == nil {
		return nil
	}

	req, err := http.NewRequestWithContext(ctx, "POST", m.opts.Url, nil)

	if err != nil {
		return err
	}

	for key, value := range m.opts.Headers {
		req.Header.Set(key, value)
	}

	resp, err := m.client.Do(req)
	if err != nil {
		return err
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("failed to send webhook: %s, status: %d", resp.Status, resp.StatusCode)
	}

	return nil
}
