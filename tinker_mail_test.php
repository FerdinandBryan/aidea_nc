<?php

use Illuminate\Support\Facades\Mail;

try {
    Mail::raw('This is a raw test email from AIDEA at ' . now(), function ($m) {
        $m->to('nc.romailynflores@gmail.com')->subject('AIDEA Mail Test');
    });
    echo "RESULT: SENT without exception." . PHP_EOL;
} catch (\Throwable $e) {
    echo "RESULT: FAILED - " . $e->getMessage() . PHP_EOL;
}
