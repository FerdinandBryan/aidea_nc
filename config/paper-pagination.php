<?php

return [
    // Enable after validating the Writer/UNO integration on the deployment image.
    'enabled' => (bool) env('PAPER_PAGINATION_ENABLED', false),
];
