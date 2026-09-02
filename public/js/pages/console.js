/* ============================================================
   eFootball Ban & Pick — Admin console entry
   ============================================================ */

import { initConsole } from '@/features/admin/index.js';
import { installErrorReporter } from '@/shared/lib/errorReporter.js';

/* No `notify`: console.html has no #toast element, so there is nothing to show
   a message in. The error is still logged and still reported, which is the half
   that was missing. Give this page a toast and pass one in.  */
installErrorReporter();

initConsole();
