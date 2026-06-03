import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '../../i18n'
import { TrackDetail } from './track-detail'
import type { TrackMetadata, Waveform } from '../../../../shared/types'

const META: TrackMetadata = {
  tags: { artist: 'M83', album: 'Hurry Up', year: '2011' },
  audio: {
    codec: 'mp3',
    bitrateKbps: 320,
    sampleRateHz: 44100,
    channels: 2,
    durationSec: 243,
    sizeBytes: 10171187
  }
}

describe('TrackDetail', () => {
  it('renders formatted audio specs', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} />)
    expect(html).toContain('320 kbps')
    expect(html).toContain('4:03')
    expect(html).toContain('44.1 kHz')
    expect(html).toContain('Stereo')
    expect(html).toContain('9.7 MB')
  })

  it('omits tag fields that have no value', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} />)
    expect(html).toContain('M83')
    // genre + track # absent from META → their labels should not render
    expect(html).not.toContain('Genre')
    expect(html).not.toContain('Track #')
  })

  it('renders key, Camelot, and BPM tags when present', () => {
    const meta: TrackMetadata = {
      tags: { ...META.tags, key: 'Am', camelot: '8A', bpm: '124' },
      audio: META.audio
    }
    const html = renderToStaticMarkup(<TrackDetail meta={meta} />)
    expect(html).toContain('Key')
    expect(html).toContain('Am')
    expect(html).toContain('Camelot')
    expect(html).toContain('8A')
    expect(html).toContain('BPM')
    expect(html).toContain('124')
  })

  it('renders the source URL as a link with the protocol stripped', () => {
    const html = renderToStaticMarkup(
      <TrackDetail meta={META} source={{ videoId: 'dX3k_QDnzHE' }} />
    )
    expect(html).toContain('href="https://www.youtube.com/watch?v=dX3k_QDnzHE"')
    expect(html).toContain('youtube.com/watch?v=dX3k_QDnzHE')
    expect(html).toContain('dX3k_QDnzHE') // video id field
  })

  it('shows a loading state without specs', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={null} state="loading" />)
    expect(html).toContain('Reading metadata')
    expect(html).not.toContain('kbps')
  })

  it('renders editable tag inputs and Save/Cancel in edit mode', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} editing />)
    expect(html).toContain('<input')
    expect(html).toContain('value="M83"') // tag prefilled as an input value
    expect(html).toContain('Save')
    expect(html).toContain('Audio read-only')
    // audio specs are still shown (read-only) in edit mode
    expect(html).toContain('320 kbps')
  })

  it('renders the waveform strip when a waveform is provided', () => {
    const wf: Waveform = { peaks: Array.from({ length: 120 }, () => 0.5), durationSec: 243 }
    const html = renderToStaticMarkup(<TrackDetail meta={META} waveform={wf} />)
    expect(html).toContain('data-wave-bar')
  })

  it('omits the waveform in tag-edit mode', () => {
    const wf: Waveform = { peaks: Array.from({ length: 120 }, () => 0.5), durationSec: 243 }
    const html = renderToStaticMarkup(<TrackDetail meta={META} waveform={wf} editing />)
    expect(html).not.toContain('data-wave-bar')
  })

  it('omits the waveform when none is provided', () => {
    const html = renderToStaticMarkup(<TrackDetail meta={META} />)
    expect(html).not.toContain('data-wave-bar')
  })

  it('omits the waveform when showWaveform is false, even if peaks are provided', () => {
    const wf: Waveform = { peaks: Array.from({ length: 120 }, () => 0.5), durationSec: 243 }
    const html = renderToStaticMarkup(<TrackDetail meta={META} waveform={wf} showWaveform={false} />)
    expect(html).not.toContain('data-wave-bar')
  })
})
