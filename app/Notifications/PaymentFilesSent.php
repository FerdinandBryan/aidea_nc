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

        $mail = (new MailMessage)
            ->subject($isCert ? 'Your AIDEA certificate is ready' : 'New files from AIDEA Admin')
            ->view('emails.payment-files', [
                'isCertificate' => $isCert,
                'name'          => $notifiable->fname ?: ($notifiable->full_name ?? 'there'),
                'service'       => $this->payment->service ?? null,
                'note'          => $this->message,
                'files'         => $this->files,
            ]);

        foreach ($this->files as $f) {
            $mail->attach(storage_path('app/public/' . $f['path']), ['as' => $f['name']]);
        }

        return $mail;
    }
}