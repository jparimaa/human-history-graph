# Human History Graph: Connection Rules

## Core Principle

A connection should represent a meaningful historical relationship between two people.

The existence of a connection should answer the question:

**"Why is it interesting that these two people are connected?"**

If the answer is weak, obvious, trivial, or uninteresting, do not create the edge.

---

## Rule 1: Direct Historical Relationship Required

A connection requires evidence of a real historical relationship.

Examples:

* Teacher and student
* Mentor and protégé
* Patron and artist
* Scientific collaborators
* Political allies
* Political rivals
* Military enemies
* Religious enemies
* Founder and successor
* Family members whose relationship had historical significance

Not sufficient:

* Lived in the same city
* Attended the same event
* Were aware of each other
* Met once with no meaningful consequences
* Shared a profession
* Were both famous

---

## Rule 2: The Relationship Must Have Historical Significance

The interaction must have produced a meaningful outcome.

Good examples:

* Aristotle taught Alexander.
* Leonardo da Vinci worked for Ludovico Sforza.
* Voltaire influenced Catherine the Great through correspondence.
* Thomas Edison and Nikola Tesla worked together and later became rivals.
* Martin Luther and Pope Leo X were central opponents in the Reformation.

Bad examples:

* Two artists exchanged greetings.
* Two politicians attended the same banquet.
* A king briefly met a philosopher.

---

## Rule 3: Contemporary Overlap Required

People must have been alive at the same time.

If lifespans do not overlap, no connection is allowed.

Exceptions:

### Predecessor-Successor Relationships

Allowed when the later person directly inherited a role, office, institution, movement, or project.

Examples:

* Roman emperors
* Popes
* Patriarchs
* Monarchs
* Company CEOs
* Scientific leadership succession

The succession itself must be historically meaningful.

---

## Rule 4: Influence Alone Is Not Enough

Historical influence does not create a connection unless a direct relationship existed.

Do not connect:

* Newton to Einstein
* Plato to Nietzsche
* Shakespeare to Goethe

These are influence relationships, not interpersonal relationships.

The graph focuses on human networks, not idea networks.

---

## Rule 5: Prefer Specific Stories

Every edge should be explainable in one sentence.

Examples:

* "Galileo was tried by Pope Urban VIII."
* "Mozart was employed by Archbishop Colloredo."
* "Alexander studied under Aristotle."

If no concise story exists, reject the edge.

---

## Rule 6: Strong Connections Beat Complete Connections

The goal is not to capture every valid relationship.

The goal is to capture the most meaningful relationships.

When choosing among multiple possible edges, keep only the strongest.

Example:

A scientist may have:

* 40 correspondents
* 10 collaborators
* 3 major rivals
* 1 famous student

The graph may only include the student, rivals, and key collaborators.

---

## Rule 7: When in Doubt, Omit

A sparse graph with meaningful edges is better than a dense graph with questionable edges.

Missing an edge is acceptable.

A bad edge damages trust in the entire graph.

---

## Rule 8: Only one connection between two people

Don't make connection from Leonardo da Vinci to Michelangelo, and then from 
Michelangelo to Leonardo da Vinci. Make the connection only once, from older
person to younger person.

## Rule 9: Relation types

Only the following relationship types are allowed:

* `teacher`
* `mentor`
* `collaborator`
* `rival`
* `ally`
* `enemy`
* `patron`
* `family`
* `spouse`
* `romantic`
* `friend`
* `predecessor`

No other relationship types may be used.

Note that for example while Alexander the Great is a student of Aristotle, 
there should be only one relation: from Aristotle to Alexander the Great with the type "teacher".

### teacher

A formal or well-documented teaching relationship.

### mentor

A significant guidance relationship that is not primarily a teacher-student relationship.

### collaborator

Worked together on a meaningful project, expedition, artistic work, scientific research, political effort, military campaign, institution, or other substantial undertaking.

### rival

A documented and historically significant competition between peers.

### ally

A cooperative political, military, religious, professional, or personal partnership.

### enemy

A documented and historically significant relationship of opposition, conflict, or hostility.

### patron

Provided financial, political, institutional, royal, court, or organizational support that enabled the work or career of the other person.

### family

A historically significant family relationship.

Family relationships should only be included when the relationship itself played a meaningful role in history.

### spouse

A legally recognized marriage.

### romantic

A significant romantic relationship without marriage, or where the romantic relationship is historically more important than the marital status.

### friend

A documented friendship that historians commonly discuss as part of either person's life story.

### predecessor

The source person directly preceded the target person in the same office, title, leadership role, institution, or position.

Valid examples:

* one pope followed by the next pope
* one monarch followed by the next monarch
* one CEO followed by the next CEO
* one president of an institution followed by the next president

Invalid examples:

* Vasco da Gama → Ferdinand Magellan
* Leonardo da Vinci → Michelangelo
* Isaac Newton → Albert Einstein

Being an earlier historical figure does not make someone a predecessor.

## Rule 10: Relationship Type Must Be Unambiguous

Every connection must be assignable to exactly one relationship type.

If multiple types seem possible, choose the single type that best represents the most historically significant aspect of the relationship.

If no clear choice exists, reject the connection.

The inability to confidently choose a relationship type is evidence that the connection is too weak, too vague, or too unimportant for inclusion.

People often have multiple relationships over time.

For example:

* friends who became rivals
* allies who became enemies
* collaborators who later competed
* spouses who later separated

Do not create multiple connections.

Choose the relationship that best explains why historians remember the connection.

Examples:

* Aristotle → Alexander the Great = `teacher`
* Thomas Edison ↔ Nikola Tesla = `rival`
* Lorenzo de' Medici → Leonardo da Vinci = `patron`
* Sigmund Freud → Carl Jung = `mentor`
* James Watson ↔ Francis Crick = `collaborator`

Additional details can be explained in the description.
