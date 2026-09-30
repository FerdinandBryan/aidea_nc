<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class PaymentFilesSent extends Notification
{
    use Queueable;

    public function __construct(
        public $payment,
        public string $type,
        public array $files,
        public ?string $message = null
    ) {}

    public function via($notifiable): array
    {
        return ['database', 'mail']; // in-system + Gmail
    }

    public function toDatabase($notifiable): array
    {
        return [
            'title'      => $this->type === 'certificate' ? 'Your certificate is ready' : 'New files from admin',
            'payment_id' => $this->payment->id,
            'service'    => $this->payment->service ?? null,
            'files'      => $this->files,
            'message'    => $this->message,
        ];
    }

    public function toMail($notifiable): MailMessage
    {
        $isCert = $this->type === 'certificate';
        $limit = 8 * 1024 * 1024; $total = 0; $links = []; $attach = [];
        foreach ($this->files as $pf) {
            $abs = storage_path('app/public/' . $pf['path']);
            $sz = is_file($abs) ? filesize($abs) : 0;
            if ($sz > 0 && ($total + $sz) <= $limit) { $attach[] = [$abs, $pf['name']]; $total += $sz; }
            else { $links[] = $pf['name'] . ': ' . url('/api/download/payment-files/' . ltrim(preg_replace('#^payment-files/#', '', $pf['path']), '/') . '?name=' . rawurlencode($pf['name'])); }
        }

        $mail = (new MailMessage)
            ->subject($isCert ? 'Your AIDEA certificate is ready' : 'New files from AIDEA Admin')
            ->view('emails.payment-files', [
                'isCertificate' => $isCert,
                'name'          => $notifiable->fname ?: ($notifiable->full_name ?? 'there'),
                'service'       => $this->payment->service ?? null,
                'note'          => trim(($this->message ? $this->message . "

" : '') . (count($links) ? "Download (file too large to attach):
" . implode("
", $links) : '')) ?: null,
                'files'         => $this->files,
            ]);

        foreach ($this->files as $f) {
            foreach ($attach as $a) { $mail->attach($a[0], ['as' => $a[1]]); } $attach = [];
        }

        return $mail;
    }
}