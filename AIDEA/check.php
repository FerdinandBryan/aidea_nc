<?php $theses = App\Models\ThesisSubmission::with('user')->get(); foreach($theses as $t) { echo $t->id . ' => ' . ($t->user ? $t->user->name : 'NULL USER') . PHP_EOL; }
