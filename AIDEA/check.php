<?php foreach (glob("config/*.php") as $f) { echo $f . "\n"; $r = include $f; if (!is_array($r)) { echo "  ^^^ BROKEN - not returning array\n"; } else { echo "  OK\n"; } }
