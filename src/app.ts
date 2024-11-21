console.log("Hello from TypeScript!");

import { Chart, ChartConfiguration } from 'chart.js/auto';

interface TimeEntry {
    id?: number;
    date: string;
    hours: number;
    link: string;
    notes: string | null;
}

class WorkTimeTracker {
    private db: IDBDatabase | null = null;
    private chartInstance: Chart | null = null;

    constructor() {
        this.initIndexedDB();
        this.initEventListeners();
        this.initSearchFunctionality();
    }

    private initIndexedDB(): void {
        console.log('opening db');

        const request = indexedDB.open('WorkTimeTrackerDB', 1);

        request.onerror = (event) => {
            console.error('IndexedDB error:', event);
        };

        request.onsuccess = (event) => {
            this.db = (event.target as IDBOpenDBRequest).result;
            this.loadEntries();
            this.updateSummaryChart();
        };

        request.onupgradeneeded = (event) => {
            console.log('upgrading db');
            const db = (event.target as IDBOpenDBRequest).result;
            const objectStore = db.createObjectStore('timeEntries', { keyPath: 'id', autoIncrement: true });
            objectStore.createIndex('date', 'date', { unique: false });
            objectStore.createIndex('link', 'link', { unique: false });
            console.log('created indices');
        };
    }

    private initEventListeners(): void {
        document.getElementById('exportBtn')?.addEventListener('click', () => this.exportToCSV());
        document.getElementById('importBtn')?.addEventListener('click', () => this.importFromCSV());
        document.getElementById('scrollTopBtn')?.addEventListener('click', () => this.scrollToTop());
        document.getElementById('scrollCurrentBtn')?.addEventListener('click', () => this.scrollToCurrent());
        document.getElementById('saveBtn')?.addEventListener('click', () => this.saveEntries());
        
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        fileInput?.addEventListener('change', (event) => this.handleFileSelect(event));
    }

    private scrollToTop(): void {
        const parallaxContainer = document.querySelector('.parallax') as HTMLElement;
        if (parallaxContainer) {
            parallaxContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    private scrollToCurrent(): void {
        const today = new Date().toISOString().split('T')[0];
        const currentEntry = document.querySelector(`[data-date="${today}"]`);
        if (currentEntry) {
            currentEntry.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            const parallaxContainer = document.querySelector('.parallax') as HTMLElement;
            if (parallaxContainer) {
                parallaxContainer.scrollTo({ top: parallaxContainer.scrollHeight, behavior: 'smooth' });
            }
        }
    }

    private async loadEntries(): Promise<void> {
        if (!this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readonly');
        const objectStore = transaction.objectStore('timeEntries');
        const request = objectStore.getAll();

        request.onsuccess = () => {
            const entries = request.result as TimeEntry[];
            this.renderEntries(entries);
        };
    }

    private renderEntries(entries: TimeEntry[]): void {
        const entryList = document.getElementById('entryList');
        if (!entryList) return;

        entryList.innerHTML = '';
        const groupedEntries = this.groupEntriesByDate(entries);
        const today = new Date();
        const showWeekends = false;

        for (let i = 0; i < 8; i++) {
            const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
            const day = d.getDay();
            if (!showWeekends && (day === 0 || day === 6)) {
                continue;
            }
            const date = d.toISOString().split('T')[0];
            const dateEntries = groupedEntries.get(date) || [];

            const card = document.createElement('div');
            card.className = 'card entry-card';
            card.setAttribute('data-date', date);
            card.setAttribute('role', 'listitem');
            
            const totalHours = dateEntries.reduce((sum, entry) => sum + entry.hours, 0);
            
            card.innerHTML = `
                <header class="card-header">
                    <p class="card-header-title">${date} (${totalHours}/8 hours)</p>
                </header>
                <div class="card-content">
                    ${dateEntries.length ? dateEntries.map(entry => `
                        <div class="content" data-entry-id="${entry.id}">
                            <p>Hours: ${entry.hours}</p>
                            <p>Link: <a href="${entry.link}" target="_blank">${entry.link}</a></p>
                            <p>Notes: ${entry.notes || ''}</p>
                            <button class="button is-small is-info edit-entry" type="button">Edit</button>
                        </div>
                    `).join('') : '<p class="has-text-grey">Nothing entered</p>'}
                </div>
            `;

            const form = document.createElement('form');
            form.className = 'card-footer';
            form.innerHTML = `
                <div class="card-footer-item">
                    <div class="field is-grouped">
                        <p class="control is-expanded">
                            <input class="input" type="number" step="0.5" min="0" max="24" placeholder="Hours" required aria-label="Hours worked">
                        </p>
                        <p class="control is-expanded">
                            <input class="input" type="url" placeholder="Project Link" required aria-label="Project link">
                        </p>
                        <p class="control is-expanded">
                            <input class="input" type="text" placeholder="Notes" aria-label="Notes">
                        </p>
                        <p class="control">
                            <button type="submit" class="button is-primary">Add</button>
                        </p>
                    </div>
                </div>
            `;

            form.addEventListener('submit', (e) => this.handleNewEntry(e, date));
            card.appendChild(form);

            card.querySelectorAll('.edit-entry').forEach(button => {
                button.addEventListener('click', (e) => this.handleEditEntry(e));
            });

            entryList.appendChild(card);
        }
    }

    private groupEntriesByDate(entries: TimeEntry[]): Map<string, TimeEntry[]> {
        const grouped = new Map<string, TimeEntry[]>();
        for (const entry of entries) {
            if (!grouped.has(entry.date)) {
                grouped.set(entry.date, []);
            }
            grouped.get(entry.date)?.push(entry);
        }
        return new Map([...grouped.entries()].sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()));
    }

    private handleNewEntry(e: Event, date: string): void {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const hours = parseFloat((form.elements[0] as HTMLInputElement).value);
        const link = (form.elements[1] as HTMLInputElement).value;
        const notes = (form.elements[2] as HTMLInputElement).value;

        const newEntry: TimeEntry = { date, hours, link, notes: notes || null };
        this.addEntry(newEntry);
        form.reset();
    }

    private handleEditEntry(e: Event): void {
        const button = e.target as HTMLButtonElement;
        const content = button.closest('.content') as HTMLElement;
        const entryId = parseInt(content.getAttribute('data-entry-id') || '0');
        const card = content.closest('.entry-card') as HTMLElement;
        const form = card.querySelector('form') as HTMLFormElement;

        const hoursElement = content.querySelector('p:nth-child(1)');
        const linkElement = content.querySelector('p:nth-child(2) a');
        const notesElement = content.querySelector('p:nth-child(3)');

        if (hoursElement && linkElement && notesElement && form) {
            const hours = parseFloat(hoursElement.textContent?.split(': ')[1] || '0');
            const link = linkElement.getAttribute('href') || '';
            const notes = notesElement.textContent?.split(': ')[1] || '';

            (form.elements[0] as HTMLInputElement).value = hours.toString();
            (form.elements[1] as HTMLInputElement).value = link;
            (form.elements[2] as HTMLInputElement).value = notes;

            content.style.display = 'none';
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.textContent = 'Update';
            }
            form.onsubmit = (e) => this.handleUpdateEntry(e, entryId);
        }
    }

    private handleFileSelect(event: Event): void {
        const fileInput = event.target as HTMLInputElement;
        const file = fileInput.files?.[0];
        
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const contents = e.target?.result as string;
                this.processCSV(contents);
            };
            reader.readAsText(file);
        }
    }

    private handleUpdateEntry(e: Event, entryId: number): void {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const hours = parseFloat((form.elements[0] as HTMLInputElement).value);
        const link = (form.elements[1] as HTMLInputElement).value;
        const notes = (form.elements[2] as HTMLInputElement).value;

        this.updateEntry({ id: entryId, date: '', hours, link, notes: notes || null });
        form.reset();
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Add';
        }
        form.onsubmit = (e) => this.handleNewEntry(e, '');
    }

    private importFromCSV(): void {
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        fileInput.click();
    }

    private processCSV(contents: string): void {
        const lines = contents.split('\n');
        const headers = lines[0].split(',');
        const entries: TimeEntry[] = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if (values.length === headers.length) {
                const entry: TimeEntry = {
                    date: values[0],
                    hours: parseFloat(values[1]),
                    link: values[2],
                    notes: values[3] || null
                };
                entries.push(entry);
            }
        }

        this.importEntries(entries);
    }

    private addEntry(entry: TimeEntry): void {
        if (!this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readwrite');
        const objectStore = transaction.objectStore('timeEntries');
        const request = objectStore.add(entry);

        request.onsuccess = () => {
            this.loadEntries();
            this.updateSummaryChart();
        };
    }

    private importEntries(entries: TimeEntry[]): void {
        if (!this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readwrite');
        const objectStore = transaction.objectStore('timeEntries');

        objectStore.clear();

        entries.forEach(entry => {
            objectStore.add(entry);
        });

        transaction.oncomplete = () => {
            this.loadEntries();
            this.updateSummaryChart();
            alert('Entries imported successfully!');
        };
    }

    private updateEntry(entry: TimeEntry): void {
        if (!this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readwrite');
        const objectStore = transaction.objectStore('timeEntries');
        const request = objectStore.put(entry);

        request.onsuccess = () => {
            this.loadEntries();
            this.updateSummaryChart();
        };
    }

    private saveEntries(): void {
        const entryList = document.getElementById('entryList');
        if (!entryList || !this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readwrite');
        const objectStore = transaction.objectStore('timeEntries');

        const cards = entryList.querySelectorAll('.entry-card');
        cards.forEach(card => {
            const date = card.getAttribute('data-date');
            const forms = card.querySelectorAll('form');
            forms.forEach(form => {
                const hours = parseFloat((form.elements[0] as HTMLInputElement).value);
                const link = (form.elements[1] as HTMLInputElement).value;
                const notes = (form.elements[2] as HTMLInputElement).value;

                if (hours && link && notes) {
                    const entry: TimeEntry = { date: date!, hours, link, notes };
                    objectStore.add(entry);
                }
            });
        });

        transaction.oncomplete = () => {
            this.loadEntries();
            this.updateSummaryChart();
            alert('Entries saved successfully!');
        };
    }

    private async updateSummaryChart(): Promise<void> {
        if (!this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readonly');
        const objectStore = transaction.objectStore('timeEntries');
        const request = objectStore.getAll();

        request.onsuccess = () => {
            const entries = request.result as TimeEntry[];
            const projectSummary = this.summarizeProjects(entries);

            const ctx = document.getElementById('summaryChart') as HTMLCanvasElement;
            if (this.chartInstance) {
                this.chartInstance.destroy();
            }

            this.chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Array.from(projectSummary.keys()),
                    datasets: [{
                        label: 'Hours Logged',
                        data: Array.from(projectSummary.values()),
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            } as ChartConfiguration);
            this.chartInstance.resize(500, 200);
        };
    }

    private summarizeProjects(entries: TimeEntry[]): Map<string, number> {
        const summary = new Map<string, number>();
        for (const entry of entries) {
            const project = entry.date;
            summary.set(project, (summary.get(project) || 0) + entry.hours);
        }
        return summary;
    }

    private initSearchFunctionality(): void {
        const searchForm = document.getElementById('search-form') as HTMLFormElement;
        const searchInput = document.getElementById('search-input') as HTMLInputElement;
        const searchResult = document.getElementById('search-result') as HTMLSpanElement;

        searchForm.addEventListener('submit', (event) => {
            event.preventDefault();
            const projectLink = searchInput.value.trim();
            if (!projectLink) return;

            this.searchProjectHours(projectLink)
                .then((hours) => {
                    searchResult.textContent = `Total hours worked on ${projectLink}: ${hours}`;
                })
                .catch((error) => {
                    searchResult.textContent = `Error: ${error.message}`;
                });
        });
    }

    private async searchProjectHours(projectLink: string): Promise<number> {
        if (!this.db) throw new Error('Database not initialized');

        const transaction = this.db.transaction(['timeEntries'], 'readonly');
        const objectStore = transaction.objectStore('timeEntries');
        const index = objectStore.index('link');
        const request = index.getAll(IDBKeyRange.only(projectLink));

        const entries = await new Promise<TimeEntry[]>((resolve, reject) => {
            request.onsuccess = () => resolve(request.result as TimeEntry[]);
            request.onerror = () => reject(request.error);
        });

        const totalHours = entries.reduce((sum, entry) => sum + entry.hours, 0);
        return totalHours;
    }

    private exportToCSV(): void {
        if (!this.db) return;

        const transaction = this.db.transaction(['timeEntries'], 'readonly');
        const objectStore = transaction.objectStore('timeEntries');
        const request = objectStore.getAll();

        request.onsuccess = () => {
            const entries = request.result as TimeEntry[];
            const csvContent = this.convertToCSV(entries);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', 'work_time_entries.csv');
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        };
    }

    private convertToCSV(entries: TimeEntry[]): string {
        const header = 'date,hours,link,notes\n';
        const rows = entries.map(entry => 
            `${entry.date},${entry.hours},${entry.link},"${entry.notes?.replace(/"/g, '""')}"`
        ).join('\n');
        return header + rows;
    }
}

new WorkTimeTracker();