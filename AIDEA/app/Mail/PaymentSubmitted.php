<?php

namespace App\Mail;

use App\Models\Payment;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Queue\SerializesModels;

class PaymentSubmitted extends Mailable
{
    use Queueable, SerializesModels;

    public Payment $payment;

    public function __construct(Payment $payment)
    {
        $this->payment = $payment;
    }

    public function build()
    {
        $email = $this->subject('New Service Payment Submitted - ' . $this->payment->service)
            ->view('emails.payment-submitted');

        if (!empty($this->payment->research_items)) {
            $items = json_decode($this->payment->research_items, true) ?: [];

            foreach ($items as $idx => $item) {
                if (in_array($item['type'] ?? '', ['file', 'image']) && !empty($item['file_base64'])) {
                    if (preg_match('/^data:(.*?);base64,(.*)$/', $item['file_base64'], $m)) {
                        $mime = $m[1];
                        $data = base64_decode($m[2]);
                        $name = $item['file_name'] ?? ('research_item_' . $idx);
                        $email->attachData($data, $name, ['mime' => $mime]);
                    }
                }
            }
        }

        return $email;
    }
}
