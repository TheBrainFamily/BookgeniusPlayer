import { test, expect } from "vitest";
import { rewriteNotes } from "./rewrite-notes";

const input = `
      <section><section data-chapter="1">
    <h4 data-index="0">I. Jak wygląda firma J. Mincel i&nbsp;S. Wokulski przez szkło butelek?</h4>
 <p data-index="1">
 W&nbsp;początkach roku 1878, kiedy świat polityczny zajmował się pokojem san-stefańskim<a href="#fn1" class="link-note">1</a>, wyborem nowego papieża<a href="#fn2" class="link-note">2</a> albo szansami europejskiej wojny<a href="#fn3" class="link-note">3</a>, warszawscy kupcy tudzież inteligencja pewnej okolicy Krakowskiego Przedmieścia<a href="#fn4" class="link-note">4</a> niemniej gorąco interesowała się przyszłością galanteryjnego sklepu pod&nbsp;firmą <span data-c="jan-mincel-mlodszy">J. Mincel</span> i&nbsp;<span class="text-nowrap"><span data-c="stanislaw-wokulski">S. Wokulski</span>.</span>
 </p>
 <p data-index="2">
 W&nbsp;renomowanej jadłodajni, gdzie na&nbsp;wieczorną przekąskę zbierali się właściciele składów bielizny i&nbsp;składów win, fabrykanci powozów i&nbsp;kapeluszy, poważni ojcowie rodzin, utrzymujący się z&nbsp;własnych funduszów, i&nbsp;posiadacze kamienic bez&nbsp;zajęcia, równie dużo mówiono o&nbsp;uzbrojeniach Anglii<a href="#fn5" class="link-note">5</a>, jak o&nbsp;firmie <span data-c="jan-mincel-mlodszy">J. Mincel</span> i&nbsp;<span class="text-nowrap"><span data-c="stanislaw-wokulski">S. Wokulski</span>.</span> Zatopieni w&nbsp;kłębach dymu cygar i&nbsp;pochyleni nad&nbsp;butelkami z&nbsp;ciemnego szkła obywatele tej dzielnicy, jedni zakładali się o&nbsp;wygranę lub&nbsp;przegranę Anglii, drudzy o&nbsp;bankructwo <span class="text-nowrap"><span data-c="stanislaw-wokulski">Wokulskiego</span>;</span> jedni nazywali geniuszem Bismarcka<a href="#fn6" class="link-note">6</a>, drudzy — awanturnikiem <span class="text-nowrap"><span data-c="stanislaw-wokulski">Wokulskiego</span>;</span> jedni krytykowali postępowanie prezydenta MacMahona<a href="#fn7" class="link-note">7</a>, inni twierdzili, że&nbsp;<span data-c="stanislaw-wokulski">Wokulski</span> jest zdecydowanym wariatem, jeżeli nie czymś gorszym…
 </p>
 </section></section>`;

const output = `
      <section><section data-chapter="1">
    <h4 data-index="0">I. Jak wygląda firma J. Mincel i&nbsp;S. Wokulski przez szkło butelek?</h4>
 <p data-index="1">
 W&nbsp;początkach roku 1878, kiedy świat polityczny zajmował się pokojem san-stefańskim<a data-note="1" class="link-note">1</a>, wyborem nowego papieża<a data-note="2" class="link-note">2</a> albo szansami europejskiej wojny<a data-note="3" class="link-note">3</a>, warszawscy kupcy tudzież inteligencja pewnej okolicy Krakowskiego Przedmieścia<a data-note="4" class="link-note">4</a> niemniej gorąco interesowała się przyszłością galanteryjnego sklepu pod&nbsp;firmą <span data-c="jan-mincel-mlodszy">J. Mincel</span> i&nbsp;<span class="text-nowrap"><span data-c="stanislaw-wokulski">S. Wokulski</span>.</span>
 </p>
 <p data-index="2">
 W&nbsp;renomowanej jadłodajni, gdzie na&nbsp;wieczorną przekąskę zbierali się właściciele składów bielizny i&nbsp;składów win, fabrykanci powozów i&nbsp;kapeluszy, poważni ojcowie rodzin, utrzymujący się z&nbsp;własnych funduszów, i&nbsp;posiadacze kamienic bez&nbsp;zajęcia, równie dużo mówiono o&nbsp;uzbrojeniach Anglii<a data-note="5" class="link-note">5</a>, jak o&nbsp;firmie <span data-c="jan-mincel-mlodszy">J. Mincel</span> i&nbsp;<span class="text-nowrap"><span data-c="stanislaw-wokulski">S. Wokulski</span>.</span> Zatopieni w&nbsp;kłębach dymu cygar i&nbsp;pochyleni nad&nbsp;butelkami z&nbsp;ciemnego szkła obywatele tej dzielnicy, jedni zakładali się o&nbsp;wygranę lub&nbsp;przegranę Anglii, drudzy o&nbsp;bankructwo <span class="text-nowrap"><span data-c="stanislaw-wokulski">Wokulskiego</span>;</span> jedni nazywali geniuszem Bismarcka<a data-note="6" class="link-note">6</a>, drudzy — awanturnikiem <span class="text-nowrap"><span data-c="stanislaw-wokulski">Wokulskiego</span>;</span> jedni krytykowali postępowanie prezydenta MacMahona<a data-note="7" class="link-note">7</a>, inni twierdzili, że&nbsp;<span data-c="stanislaw-wokulski">Wokulski</span> jest zdecydowanym wariatem, jeżeli nie czymś gorszym…
 </p>
 </section></section>`;
test("Rewrite old format of notes to new format", () => {
  expect(rewriteNotes(input)).toBe(output);
});
